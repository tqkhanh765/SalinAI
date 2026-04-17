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
    buildFallbackAction,
} = require("../services/core/agentSafetyService");
const { toVietnamISOString } = require("../utils/vietnamTime");

const { executeRAGTool } = require("../services/ai/retrievalService");
const { researcherAgent } = require("./agentResearch");

const {
    orchestratorAgent,
    finalizeAction,
} = require("./agentOrchestration");
const { buildPolicyPromptBlock } = require("../services/ai/policyLearningService");
const { createLangchainFormattingService } = require("../services/ai/langchainFormattingService");
const { createLangchainResilienceService } = require("../services/ai/langchainResilienceService");

const MAX_RESEARCH_LOOPS = Math.max(1, parseInt(process.env.MAX_RESEARCH_LOOPS || "2", 10));
const MAX_ORCHESTRATION_LOOPS = Math.max(1, parseInt(process.env.MAX_ORCHESTRATION_LOOPS || "3", 10));
const RESEARCHER_PHASE_TIMEOUT_MS = Math.max(
    2000,
    parseInt(process.env.RESEARCHER_PHASE_TIMEOUT_MS || process.env.AGENT_PHASE_TIMEOUT_MS || "25000", 10)
);
const ORCHESTRATOR_PHASE_TIMEOUT_MS = Math.max(
    2000,
    parseInt(process.env.ORCHESTRATOR_PHASE_TIMEOUT_MS || process.env.AGENT_PHASE_TIMEOUT_MS || "20000", 10)
);
const AGENT_TIMEOUT_RETRIES = Math.max(0, parseInt(process.env.AGENT_TIMEOUT_RETRIES || "1", 10));
const AGENT_TIMEOUT_RETRY_DELAY_MS = Math.max(0, parseInt(process.env.AGENT_TIMEOUT_RETRY_DELAY_MS || "600", 10));
const MAX_TRACE_STEPS = Math.max(10, parseInt(process.env.AGENT_TRACE_MAX_STEPS || "40", 10));
const MAX_INSIGHT_CHARS = Math.max(200, parseInt(process.env.AGENT_INSIGHT_MAX_CHARS || "800", 10));
const MAX_RETRIEVAL_OUTPUT_CHARS = Math.max(400, parseInt(process.env.RETRIEVAL_OUTPUT_MAX_CHARS || "2200", 10));
const MAX_FULL_OUTPUT_CHARS = Math.max(2000, parseInt(process.env.MODEL_OUTPUT_MAX_CHARS || "12000", 10));
const MAX_ORCHESTRATOR_OUTPUT_PREVIEW_CHARS = Math.max(700, parseInt(process.env.ORCHESTRATOR_OUTPUT_PREVIEW_CHARS || "1600", 10));

const {
    toText,
    compactText,
    truncateText,
    cleanModelArtifacts,
    stripThinkTags,
    buildReasoningSummary,
    buildPolicySummaryForOutput,
    buildOrchestratorOutputPreview,
    normalizeFarmerReason,
    buildOrchestratorRetryPrompt,
    ensureResearcherCitations,
    parseDecisionFromText,
} = createLangchainFormattingService({
    maxInsightChars: MAX_INSIGHT_CHARS,
    maxFullOutputChars: MAX_FULL_OUTPUT_CHARS,
    maxOrchestratorOutputPreviewChars: MAX_ORCHESTRATOR_OUTPUT_PREVIEW_CHARS,
});

const {
    isRetryableAttempt,
    queueRetryInstruction,
    createNoToolActionError,
    normalizePipelineError,
    tryFinalizeFallback,
} = createLangchainResilienceService({
    maxOrchestrationLoops: MAX_ORCHESTRATION_LOOPS,
    maxFullOutputChars: MAX_FULL_OUTPUT_CHARS,
    isQuotaError,
    parseRetrySeconds,
    buildFallbackAction,
    finalizeAction,
    buildOrchestratorOutputPreview,
    buildReasoningSummary,
    truncateText,
});

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
    let orchestratorArgumentReason = "";
    let retrievalOutputPreview = "";
    let policyMemoryPreview = "";
    let policyContextForModel = "";
    let researcherTimedOut = false;
    const agentTrace = [];

    const addTrace = (phase, event, message, meta = {}) => {
        if (agentTrace.length >= MAX_TRACE_STEPS) {
            return;
        }
        agentTrace.push({
            timestamp: toVietnamISOString(),
            phase,
            event,
            message,
            meta,
        });
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const invokeWithPhaseTimeoutRetry = async ({ phaseKey, label, timeoutMs, invokeFn, iteration }) => {
        let lastError;
        const maxAttempts = AGENT_TIMEOUT_RETRIES + 1;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const startedAt = Date.now();
            try {
                const response = await withTimeout(invokeFn(), timeoutMs, label);
                addTrace(phaseKey, "latency", `${label} hoàn tất`, {
                    iteration,
                    attempt,
                    duration_ms: Date.now() - startedAt,
                    timeout_ms: timeoutMs,
                });
                return response;
            } catch (err) {
                lastError = err;
                if (err?.code !== "AGENT_TIMEOUT" || attempt >= maxAttempts) {
                    throw err;
                }

                addTrace(phaseKey, "timeout_retry", `${label} timeout, thử lại`, {
                    iteration,
                    attempt,
                    max_attempts: maxAttempts,
                    timeout_ms: timeoutMs,
                    retry_delay_ms: AGENT_TIMEOUT_RETRY_DELAY_MS,
                });

                await sleep(AGENT_TIMEOUT_RETRY_DELAY_MS);
            }
        }

        throw lastError;
    };

    try {
        console.log("\n[Pipeline] 🚀 Bắt đầu pipeline nhiều tác tử...");
        addTrace("pipeline", "start", "Bắt đầu pipeline nhiều tác tử", {
            sensor: { salinity, moisture, crop_stage },
        });

        const policyPromptBlock = await buildPolicyPromptBlock();
        policyMemoryPreview = truncateText(policyPromptBlock, Math.max(700, Math.floor(MAX_ORCHESTRATOR_OUTPUT_PREVIEW_CHARS * 0.7)));
        policyContextForModel = buildPolicySummaryForOutput(policyPromptBlock);
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
            let response;
            try {
                response = await invokeWithPhaseTimeoutRetry({
                    phaseKey: "researcher",
                    label: "Researcher phase",
                    timeoutMs: RESEARCHER_PHASE_TIMEOUT_MS,
                    invokeFn: () => researcherAgent.invoke(researcherMessages),
                    iteration: researchLoop,
                });
            } catch (err) {
                if (err?.code === "AGENT_TIMEOUT") {
                    researcherTimedOut = true;
                    researcherRawOutput = `Researcher timeout sau ${RESEARCHER_PHASE_TIMEOUT_MS}ms. Dùng summary dự phòng từ retrieval để tiếp tục Orchestrator.`;
                    addTrace("researcher", "timeout_degraded", "Researcher timeout; chuyển sang chế độ degrade và tiếp tục pipeline", {
                        iteration: researchLoop,
                        timeout_ms: RESEARCHER_PHASE_TIMEOUT_MS,
                    });
                    break;
                }
                throw err;
            }
            researcherMessages.push(response);
            const researcherContent = stripThinkTags(toText(response?.content));
            researcherRawOutput = truncateText(researcherContent);

            if (!response.tool_calls || response.tool_calls.length === 0) {
                researcherSummary = ensureResearcherCitations(researcherContent, finalSourceIds);
                researcherRawOutput = truncateText(researcherSummary);
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

        if (!researcherSummary) {
            const retrievalFallback = finalSourceIds.length > 0
                ? `Đã tham chiếu các nguồn: ${finalSourceIds.join(", ")}.`
                : "Không có source ID khả dụng từ retrieval.";
            const contextFallback = compactText(mandatoryRetrieval.context, 420);
            researcherSummary = `${retrievalFallback} Tóm tắt nhanh theo evidence retrieval: ${contextFallback || "Chưa có context retrieval chi tiết."}`;
            if (!researcherRawOutput) {
                researcherRawOutput = truncateText(researcherSummary);
            }
            addTrace("researcher", "fallback_summary", "Researcher không trả summary cuối; dùng summary dự phòng từ retrieval", {
                source_ids: finalSourceIds,
                timeout_degraded: researcherTimedOut,
            });
        }

        console.log("[Orchestrator] 🧠 Orchestrator đang đọc báo cáo Researcher và dữ liệu cảm biến thô...");
        const orchestratorMessages = [
            { role: "system", content: `${orchestratorPromptTemplate}\n\n${policyPromptBlock}` },
            {
                role: "user",
                content: `Dữ liệu cảm biến hiện tại:\n- Độ mặn: ${salinity} ppt\n- Độ ẩm đất: ${moisture}%\n- Giai đoạn cây: ${crop_stage || "VEGETATIVE"}\n\nBáo cáo từ Researcher:\n${researcherSummary}\n\nTóm tắt đánh giá cũ (policy/outcome memory):\n${policyContextForModel || "Chưa có dữ liệu đánh giá cũ."}\n\nHãy đưa ra quyết định cuối cùng và gọi tool điều khiển van. Viết ngắn gọn, tự nhiên, bằng tiếng Việt. Không liệt kê quy tắc, hãy giải thích theo kiểu suy luận của con người. Hãy lồng thông tin đánh giá cũ vào mạch văn trả lời như một phần lập luận, không tách thành block riêng.`,
            },
        ];

        let orchestrationLoop = 0;
        while (orchestrationLoop < MAX_ORCHESTRATION_LOOPS) {
            orchestrationLoop++;
            addTrace("orchestrator", "iteration", `Vòng Orchestrator ${orchestrationLoop} bắt đầu`);
            const response = await invokeWithPhaseTimeoutRetry({
                phaseKey: "orchestrator",
                label: "Orchestrator phase",
                timeoutMs: ORCHESTRATOR_PHASE_TIMEOUT_MS,
                invokeFn: () => orchestratorAgent.invoke(orchestratorMessages),
                iteration: orchestrationLoop,
            });
            orchestratorMessages.push(response);
            const orchestratorContent = cleanModelArtifacts(stripThinkTags(toText(response?.content)));
            orchestratorRawOutput = orchestratorContent;

            if (!response.tool_calls || response.tool_calls.length === 0) {
                const parsedDecision = parseDecisionFromText(orchestratorContent);
                if (parsedDecision) {
                    const toolInstance = orchestratorTools.find((tool) => tool.name === "execute_valve_control");
                    const rawOutput = await toolInstance.invoke({
                        state: parsedDecision.state,
                        reason: normalizeFarmerReason(parsedDecision.reason, parsedDecision.state),
                        source_ids: (finalSourceIds || []).map((id) => String(id)),
                    });
                    actionResult = JSON.parse(rawOutput);
                    actionResult.reason = normalizeFarmerReason(actionResult.reason, actionResult.executed_state);
                    addTrace("orchestrator", "parsed_text_decision", "Không có tool_call; đã đọc quyết định từ văn bản trả lời", {
                        state: actionResult.executed_state,
                    });
                    break;
                }

                const retryable = isRetryableAttempt(orchestrationLoop);
                addTrace("orchestrator", "no_tool_call", "Orchestrator không trả về tool_call", {
                    attempt: orchestrationLoop,
                    max_attempts: MAX_ORCHESTRATION_LOOPS,
                    retryable,
                });

                if (retryable) {
                    queueRetryInstruction({
                        orchestratorMessages,
                        buildRetryPrompt: buildOrchestratorRetryPrompt,
                        attempt: orchestrationLoop,
                        issue: "không có tool_call hợp lệ",
                        lastOutput: orchestratorContent,
                    });
                    continue;
                }

                break;
            }

            addTrace("orchestrator", "tool_calls", "Orchestrator yêu cầu gọi tool", {
                tools: response.tool_calls.map((toolCall) => toolCall.name),
            });

            for (const toolCall of response.tool_calls) {
                if (toolCall.name === "execute_valve_control") {
                    console.log("[Orchestrator] ⚡ Đang gửi lệnh điều khiển phần cứng...");
                    const toolInstance = orchestratorTools.find((tool) => tool.name === toolCall.name);
                    orchestratorArgumentReason = stripThinkTags(toText(toolCall.args?.reason || ""));
                    const rawOutput = await toolInstance.invoke(toolCall.args);
                    actionResult = JSON.parse(rawOutput);
                    actionResult.reason = normalizeFarmerReason(actionResult.reason, actionResult.executed_state);
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

            const retryable = isRetryableAttempt(orchestrationLoop);
            addTrace("orchestrator", "no_executable_action", "Có tool_call nhưng không tạo được actionResult hợp lệ", {
                attempt: orchestrationLoop,
                max_attempts: MAX_ORCHESTRATION_LOOPS,
                retryable,
            });

            if (retryable) {
                queueRetryInstruction({
                    orchestratorMessages,
                    buildRetryPrompt: buildOrchestratorRetryPrompt,
                    attempt: orchestrationLoop,
                    issue: "tool_call không tạo được action hợp lệ",
                    lastOutput: orchestratorContent,
                });
                continue;
            }
        }

        if (!actionResult) {
            addTrace("orchestrator", "error", "Không nhận được hành động van hợp lệ từ Orchestrator");
            throw createNoToolActionError();
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
                orchestrator_output_preview: buildOrchestratorOutputPreview({
                    rawOutput: orchestratorRawOutput,
                    toolReason: orchestratorArgumentReason,
                    researcherSummary,
                    action: actionResult.executed_state,
                }),
                orchestrator_reasoning_summary: buildReasoningSummary(actionResult.reason, actionResult.executed_state),
                orchestrator_tool_reason: truncateText(orchestratorArgumentReason, MAX_FULL_OUTPUT_CHARS),
                retrieval_output_preview: retrievalOutputPreview,
                researcher_provider: String(process.env.RESEARCHER_PROVIDER || "gemini").toLowerCase(),
                researcher_model:
                    process.env.SAOLA4_SMALL_MODEL || process.env.RESEARCHER_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
                orchestrator_provider: String(process.env.AI_PROVIDER || "gemini").toLowerCase(),
                orchestrator_model:
                    String(process.env.AI_PROVIDER || "gemini").toLowerCase() === "saola4_medium"
                        ? (process.env.SAOLA4_MEDIUM_MODEL || "SaoLa4-medium")
                        : (process.env.GEMINI_MODEL || "gemini-2.5-flash"),
            },
        });

        console.log(`[Orchestrator] ✅ Hành động cuối: ${actionResult.executed_state} | Lý do: ${actionResult.reason}`);
    } catch (err) {
        normalizePipelineError(err);

        addTrace("pipeline", "error", err.message, {
            code: err.code || "UNKNOWN_ERROR",
        });

        try {
            const fallbackAction = await tryFinalizeFallback({
                err,
                sensorData,
                finalHitCount,
                finalSourceIds,
                researcherSummary,
                researcherRawOutput,
                orchestratorRawOutput,
                orchestratorArgumentReason,
                retrievalOutputPreview,
                mongoDb,
                agentTrace,
                addTrace,
            });

            console.warn(`[Orchestrator] ⚠️ Dùng fallback action do lỗi pipeline: ${err.message}`);
            return;
        } catch (fallbackErr) {
            console.error("[Orchestrator] Fallback action failed:", fallbackErr.message);
        }

        await fbdb.ref("ai_status").update({
            is_processing: false,
            last_reasoning: `Lỗi trong pipeline AI: ${err.message}`,
        });

        throw err;
    }
}
module.exports = { runAgent };
