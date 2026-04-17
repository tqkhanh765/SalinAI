/**
 * Multi-agent AI runner.
 * Orchestrates the Researcher and Orchestrator phases, injects policy memory, and stores the final action trace.
 */
const { researcherPromptTemplate, orchestratorPromptTemplate } = require("./prompt");
const { getDb } = require("../config/mongodb");
const fbdb = require("../config/firebase");
const { researcherTools, orchestratorTools } = require("./tools");

// ─── Orchestration Utils & Services ────────────────────────────────────────────
const {
    isQuotaError,
    parseRetrySeconds,
    withTimeout,
} = require("../services/core/agentSafetyService");

const { executeRAGTool } = require("../services/ai/retrievalService");
const { researcherAgent } = require("./agentResearch");

const {
    orchestratorAgent,
    finalizeAction,
} = require("./agentOrchestration");
const { buildPolicyPromptBlock } = require("../services/ai/policyLearningService");

const MAX_RESEARCH_LOOPS = Math.max(3, parseInt(process.env.MAX_RESEARCH_LOOPS || "3", 10));
const MAX_ORCHESTRATION_LOOPS = Math.max(3, parseInt(process.env.MAX_ORCHESTRATION_LOOPS || "3", 10));
const AGENT_PHASE_TIMEOUT_MS = Math.max(3000, parseInt(process.env.AGENT_PHASE_TIMEOUT_MS || "12000", 10));
const MAX_TRACE_STEPS = Math.max(10, parseInt(process.env.AGENT_TRACE_MAX_STEPS || "40", 10));
const MAX_INSIGHT_CHARS = Math.max(200, parseInt(process.env.AGENT_INSIGHT_MAX_CHARS || "800", 10));
const MAX_RETRIEVAL_OUTPUT_CHARS = Math.max(400, parseInt(process.env.RETRIEVAL_OUTPUT_MAX_CHARS || "2200", 10));
const MAX_FULL_OUTPUT_CHARS = Math.max(2000, parseInt(process.env.MODEL_OUTPUT_MAX_CHARS || "12000", 10));

// ─── Pipeline Execution ──────────────────────────────────────────────────────
async function runAgent(sensorData) {
    const { salinity, moisture, crop_stage } = sensorData;
    const mongoDb = getDb();
    if (!mongoDb) {
        console.error("[Orchestrator] MongoDB chưa được kết nối.");
        await fbdb.ref("ai_status").update({
            is_processing: false,
            last_reasoning: "MongoDB chưa được kết nối. Quy trình AI không thể chạy.",
        });
        return;
    }

    let finalHitCount = 0;
    let finalSourceIds = [];
    let researcherSummary = "";
    let actionResult = null;
    let researcherRawOutput = "";
    let orchestratorRawOutput = "";
    let retrievalOutputPreview = "";
    const agentTrace = [];

    const toText = (value) => {
        if (typeof value === "string") return value;
        if (Array.isArray(value)) {
            return value
                .map((item) => {
                    if (typeof item === "string") return item;
                    if (item?.text) return item.text;
                    if (item?.content) return item.content;
                    return "";
                })
                .filter(Boolean)
                .join("\n");
        }
        if (value == null) return "";
        return String(value);
    };

    const compactText = (value, maxLen = MAX_INSIGHT_CHARS) => {
        const normalized = String(value || "").replace(/\s+/g, " ").trim();
        if (!normalized) return "";
        return normalized.length > maxLen ? `${normalized.slice(0, maxLen)}...` : normalized;
    };

    const truncateText = (value, maxLen = MAX_FULL_OUTPUT_CHARS) => {
        const text = String(value || "").trim();
        if (!text) return "";
        return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
    };

    const stripThinkTags = (value) => {
        const text = String(value || "");
        return text
            .replace(/<think>[\s\S]*?<\/think>/gi, "")
            .replace(/<think>/gi, "")
            .replace(/<\/think>/gi, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    };

    const parseDecisionFromText = (content) => {
        const text = toText(content);
        if (!text) return null;

        const safetyDecision = text.match(/(?:safety\s*decision)\s*:\s*(OPEN|CLOSED|NO_ACTION)/i);
        let state = safetyDecision ? safetyDecision[1].toUpperCase() : null;

        if (!state) {
            const explicitState = text.match(/\b(OPEN|CLOSED|NO_ACTION|CLOSE)\b/i);
            if (explicitState) {
                const token = explicitState[1].toUpperCase();
                state = token === "CLOSE" ? "CLOSED" : token;
            }
        }

        if (!state) return null;

        return {
            state,
            reason: compactText(text, 260),
        };
    };

    const addTrace = (phase, event, message, meta = {}) => {
        if (agentTrace.length >= MAX_TRACE_STEPS) {
            return;
        }
        agentTrace.push({
            timestamp: new Date().toISOString(),
            phase,
            event,
            message,
            meta,
        });
    };

    try {
        console.log("\n[Pipeline] 🚀 Bắt đầu pipeline nhiều tác tử...");
        addTrace("pipeline", "start", "Bắt đầu pipeline nhiều tác tử", {
            sensor: { salinity, moisture, crop_stage },
        });

        const policyPromptBlock = await buildPolicyPromptBlock();
        addTrace("pipeline", "policy_memory", "Đã nạp policy memory cho Orchestrator", {
            preview: compactText(policyPromptBlock, 220),
        });

        const mandatoryRetrieval = await executeRAGTool(salinity, moisture, mongoDb, crop_stage);
        finalHitCount = mandatoryRetrieval.hitCount;
        finalSourceIds = mandatoryRetrieval.sourceIds;
        retrievalOutputPreview = truncateText(mandatoryRetrieval.context, MAX_RETRIEVAL_OUTPUT_CHARS);
        addTrace("retrieval", "mandatory_rag_result", `Đã nạp sẵn ${finalHitCount} đoạn guideline cho Researcher`, {
            source_ids: finalSourceIds,
        });

        console.log("[Subagent] 🕵️ Researcher đang phân tích bằng chứng guideline...");
        const researcherMessages = [
            { role: "system", content: researcherPromptTemplate },
            {
                role: "user",
                content: `Dữ liệu cảm biến hiện tại: độ mặn ${salinity} ppt, độ ẩm đất ${moisture}%, giai đoạn cây ${crop_stage || "VEGETATIVE"}. Hãy phân tích theo kiểu tự nhiên, có chiều sâu hơn, bằng tiếng Việt. Viết như đang giải thích cho một đồng nghiệp nghe, không dùng gạch đầu dòng. Nếu có nhiều nguồn thì hãy so sánh chúng và nói nguồn nào đáng tin hơn trong tình huống này. Đừng chốt kết luận quá sớm; hãy đi từ bối cảnh, đến bằng chứng, đến nhận xét về xu hướng rồi mới kết luận. Mỗi đoạn phải nêu rõ nguồn nào đang được dùng làm bằng chứng, ví dụ guideline ID, lịch sử hành động gần đây, hoặc bài học outcome. Dưới đây là evidence retrieval bắt buộc đã được nạp sẵn:
${mandatoryRetrieval.context}`,
            },
        ];

        let researchLoop = 0;
        while (researchLoop < MAX_RESEARCH_LOOPS) {
            researchLoop++;
            addTrace("researcher", "iteration", `Vòng Researcher ${researchLoop} bắt đầu`);
            const response = await withTimeout(
                researcherAgent.invoke(researcherMessages),
                AGENT_PHASE_TIMEOUT_MS,
                "Researcher phase"
            );
            researcherMessages.push(response);
            const researcherContent = stripThinkTags(toText(response?.content));
            researcherRawOutput = truncateText(researcherContent);

            if (!response.tool_calls || response.tool_calls.length === 0) {
                researcherSummary = researcherContent;
                addTrace("researcher", "summary", "Researcher tạo bản tóm tắt cuối", {
                    preview: compactText(researcherSummary, 400),
                });
                console.log(`[Subagent] 📜 Researcher summary ready: "${researcherSummary.substring(0, 60)}..."`);
                break;
            }

            addTrace("researcher", "tool_calls", "Researcher yêu cầu gọi tool", {
                tools: response.tool_calls.map((toolCall) => toolCall.name),
            });

            for (const toolCall of response.tool_calls) {
                if (toolCall.name === "search_agricultural_guidelines") {
                    const ragData = await executeRAGTool(toolCall.args.salinity, toolCall.args.moisture, mongoDb, crop_stage);
                    finalHitCount = ragData.hitCount;
                    finalSourceIds = ragData.sourceIds;
                    retrievalOutputPreview = truncateText(ragData.context, MAX_RETRIEVAL_OUTPUT_CHARS);
                    addTrace("retrieval", "rag_result", `Đã truy xuất ${finalHitCount} đoạn guideline`, {
                        source_ids: finalSourceIds,
                    });

                    researcherMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                        content: ragData.context,
                    });
                    console.log(`[Subagent] 💾 Đã truy xuất ${finalHitCount} đoạn guideline từ RAG. Tiếp tục phân tích...`);
                } else if (toolCall.name === "query_action_history") {
                    const toolInstance = researcherTools.find((tool) => tool.name === toolCall.name);
                    const historyLog = await toolInstance.invoke(toolCall.args);
                    addTrace("researcher", "history_lookup", "Đã nạp lịch sử hành động gần đây", {
                        limit: toolCall.args?.limit ?? 3,
                        preview: String(historyLog || "").slice(0, 220),
                    });
                    researcherMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                        content: historyLog,
                    });
                    console.log("[Subagent] 🕒 Đã tải lịch sử hành động AI gần đây.");
                }
            }
        }

        console.log("[Orchestrator] 🧠 Orchestrator đang đọc báo cáo Researcher và dữ liệu cảm biến thô...");
        const orchestratorMessages = [
            { role: "system", content: `${orchestratorPromptTemplate}\n\n${policyPromptBlock}` },
            {
                role: "user",
                content: `Dữ liệu cảm biến hiện tại:\n- Độ mặn: ${salinity} ppt\n- Độ ẩm đất: ${moisture}%\n- Giai đoạn cây: ${crop_stage || "VEGETATIVE"}\n\nBáo cáo từ Researcher:\n${researcherSummary}\n\nHãy đưa ra quyết định cuối cùng và gọi tool điều khiển van. Viết ngắn gọn, tự nhiên, bằng tiếng Việt. Không liệt kê quy tắc, hãy giải thích theo kiểu suy luận của con người. Hãy cân nhắc cả guideline, lịch sử hành động, bài học từ policy/outcome memory, và đặc biệt là giai đoạn cây trước khi chốt.`,
            },
        ];

        let orchestrationLoop = 0;
        while (orchestrationLoop < MAX_ORCHESTRATION_LOOPS) {
            orchestrationLoop++;
            addTrace("orchestrator", "iteration", `Vòng Orchestrator ${orchestrationLoop} bắt đầu`);
            const response = await withTimeout(
                orchestratorAgent.invoke(orchestratorMessages),
                AGENT_PHASE_TIMEOUT_MS,
                "Orchestrator phase"
            );
            orchestratorMessages.push(response);
            const orchestratorContent = stripThinkTags(toText(response?.content));
            orchestratorRawOutput = truncateText(orchestratorContent);

            if (!response.tool_calls || response.tool_calls.length === 0) {
                const parsedDecision = parseDecisionFromText(orchestratorContent);
                if (parsedDecision) {
                    const toolInstance = orchestratorTools.find((tool) => tool.name === "execute_valve_control");
                    const rawOutput = await toolInstance.invoke({
                        state: parsedDecision.state,
                        reason: `Đã phân tích từ văn bản Orchestrator: ${stripThinkTags(parsedDecision.reason)}`,
                        source_ids: (finalSourceIds || []).map((id) => String(id)),
                    });
                    actionResult = JSON.parse(rawOutput);
                    addTrace("orchestrator", "parsed_text_decision", "Không có tool_call; đã đọc quyết định từ văn bản trả lời", {
                        state: actionResult.executed_state,
                    });
                    break;
                }

                addTrace("orchestrator", "no_tool_call", "Orchestrator không trả về tool_call");
                break;
            }

            addTrace("orchestrator", "tool_calls", "Orchestrator yêu cầu gọi tool", {
                tools: response.tool_calls.map((toolCall) => toolCall.name),
            });

            for (const toolCall of response.tool_calls) {
                if (toolCall.name === "execute_valve_control") {
                    console.log("[Orchestrator] ⚡ Đang gửi lệnh điều khiển phần cứng...");
                    const toolInstance = orchestratorTools.find((tool) => tool.name === toolCall.name);
                    const rawOutput = await toolInstance.invoke(toolCall.args);
                    actionResult = JSON.parse(rawOutput);
                    addTrace("orchestrator", "decision", "Đã thực thi tool điều khiển van", {
                        state: actionResult.executed_state,
                        blocked_by_manual: actionResult.blocked_by_manual,
                    });

                    orchestratorMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                        content: "Valve state updated.",
                    });
                }
            }

            if (actionResult) break;
        }

        if (!actionResult) {
            const noActionError = new Error("Orchestrator không trả về hành động van có thể thực thi.");
            noActionError.code = "NO_TOOL_ACTION";
            addTrace("orchestrator", "error", "Không nhận được hành động van hợp lệ từ Orchestrator");
            throw noActionError;
        }

        await finalizeAction({
            actionResult,
            sensorData,
            finalHitCount,
            finalSourceIds,
            researcherSummary,
            actor: "ORCHESTRATOR_AGENT",
            mongoDb,
            agentTrace,
            modelInsights: {
                researcher_output_preview: researcherRawOutput,
                orchestrator_output_preview: orchestratorRawOutput,
                retrieval_output_preview: retrievalOutputPreview,
                researcher_provider: String(process.env.RESEARCHER_PROVIDER || "gemini").toLowerCase(),
                researcher_model:
                    process.env.SAOLA4_SMALL_MODEL || process.env.RESEARCHER_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
                orchestrator_provider: String(process.env.AI_PROVIDER || "gemini").toLowerCase(),
                orchestrator_model:
                    String(process.env.AI_PROVIDER || "gemini").toLowerCase() === "saola_planner"
                        ? (process.env.SAOLA_PLANNER_MODEL || "saola-chat")
                        : (process.env.GEMINI_MODEL || "gemini-2.5-flash"),
            },
        });

        console.log(`[Orchestrator] ✅ Hành động cuối: ${actionResult.executed_state} | Lý do: ${actionResult.reason}`);
    } catch (err) {
        if (isQuotaError(err)) {
            const retrySeconds = parseRetrySeconds(err);
            const retryHint = retrySeconds ? ` Thử lại sau khoảng ${retrySeconds}s.` : "";
            err.message = `Vượt hạn mức model.${retryHint}`;
            err.code = err.code || "MODEL_QUOTA";
        }

        if (err?.code === "AGENT_TIMEOUT") {
            err.message = `${err.message}. Không dùng fallback.`;
        }

        addTrace("pipeline", "error", err.message, {
            code: err.code || "UNKNOWN_ERROR",
        });

        await fbdb.ref("ai_status").update({
            is_processing: false,
            last_reasoning: `Lỗi trong pipeline AI: ${err.message}`,
        });

        throw err;
    }
}
module.exports = { runAgent };
