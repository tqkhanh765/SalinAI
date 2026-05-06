/**
 * Multi-agent AI runner.
 * Orchestrates the Researcher and Orchestrator phases, injects policy memory, and stores the final action trace.
 */
const { researcherPromptTemplate, buildOrchestratorSystemPrompt } = require("./prompt");
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

const { executeRAGTool, generateSearchQueries } = require("../services/ai/retrievalService");
const { researcherAgent, createResearcherAgent, normalizeResearcherProvider } = require("./agentResearch");
const { querySalinKnowledge } = require("../services/ai/vertexSearchService");

const {
    orchestratorAgent,
    finalizeAction,
    getOrchestratorRuntimeInfo,
} = require("./agentOrchestration");

const { CROP_STAGE_PROFILES, DEFAULT_STAGE_PROFILE, logActionWithPrediction } = require("../services/ai/outcomeService");
const { buildPolicyPromptBlock } = require("../services/ai/policyLearningService");
const { createAgentUtilsService } = require("../services/ai/agentUtilsService");
const { emitToken, emitAiStatus } = require("../services/core/socketService");
const {
    startAiStreamSession,
    completeAiStreamSession,
    failAiStreamSession,
} = require("../services/core/aiStreamService");

const MAX_RESEARCH_LOOPS = Math.max(1, parseInt(process.env.MAX_RESEARCH_LOOPS || "2", 10));
const MAX_ORCHESTRATION_LOOPS = Math.max(1, parseInt(process.env.MAX_ORCHESTRATION_LOOPS || "3", 10));
const PRIMARY_RESEARCHER_PROVIDER = normalizeResearcherProvider();
const RESEARCHER_FALLBACK_PROVIDER = String(process.env.RESEARCHER_FALLBACK_PROVIDER || "gemini").toLowerCase().trim();
const RESEARCHER_PHASE_TIMEOUT_MS = Math.max(
    2000,
    parseInt(process.env.RESEARCHER_PHASE_TIMEOUT_MS || process.env.AGENT_PHASE_TIMEOUT_MS || "60000", 10)
);
const ORCHESTRATOR_PHASE_TIMEOUT_MS = Math.max(
    2000,
    parseInt(process.env.ORCHESTRATOR_PHASE_TIMEOUT_MS || process.env.AGENT_PHASE_TIMEOUT_MS || "120000", 10)
);
const AGENT_TIMEOUT_RETRIES = Math.max(0, parseInt(process.env.AGENT_TIMEOUT_RETRIES || "1", 10));
const AGENT_TIMEOUT_RETRY_DELAY_MS = Math.max(0, parseInt(process.env.AGENT_TIMEOUT_RETRY_DELAY_MS || "600", 10));
const MAX_TRACE_STEPS = Math.max(10, parseInt(process.env.AGENT_TRACE_MAX_STEPS || "40", 10));
const MAX_INSIGHT_CHARS = Math.max(200, parseInt(process.env.AGENT_INSIGHT_MAX_CHARS || "800", 10));
const MAX_RETRIEVAL_OUTPUT_CHARS = Math.max(400, parseInt(process.env.RETRIEVAL_OUTPUT_MAX_CHARS || "1200", 10));
const MAX_FULL_OUTPUT_CHARS = Math.max(2000, parseInt(process.env.MODEL_OUTPUT_MAX_CHARS || "12000", 10));
const MAX_ORCHESTRATOR_OUTPUT_PREVIEW_CHARS = Math.max(700, parseInt(process.env.ORCHESTRATOR_OUTPUT_PREVIEW_CHARS || "1600", 10));

const shouldUseResearcherFallback =
    Boolean(RESEARCHER_FALLBACK_PROVIDER) &&
    RESEARCHER_FALLBACK_PROVIDER !== PRIMARY_RESEARCHER_PROVIDER;

let fallbackResearcherAgent = null;
if (shouldUseResearcherFallback) {
    try {
        fallbackResearcherAgent = createResearcherAgent(RESEARCHER_FALLBACK_PROVIDER);
    } catch (error) {
        console.warn(`[Researcher] Không thể khởi tạo fallback provider '${RESEARCHER_FALLBACK_PROVIDER}': ${error.message}`);
    }
}

const {
    toText,
    compactText,
    truncateText,
    stripThinkTags,
    parseDecisionFromText,
    cleanModelArtifacts,
    buildReasoningSummary,
    buildOrchestratorOutputPreview,
    buildPolicySummaryForOutput,
    ensureResearcherCitations,
    normalizeFarmerReason,
    normalizePipelineError,
    tryFinalizeFallback,
    buildOrchestratorRetryPrompt,
} = createAgentUtilsService({
    maxInsightChars: MAX_INSIGHT_CHARS,
    maxFullOutputChars: MAX_FULL_OUTPUT_CHARS,
    maxOrchestratorOutputPreviewChars: MAX_ORCHESTRATOR_OUTPUT_PREVIEW_CHARS,
});

const {
    isRetryableAttempt,
    queueRetryInstruction,
    createNoToolActionError,
} = {
    // Basic logic for loop control if needed, but mostly managed in try/catch now
    isRetryableAttempt: (loop) => loop < MAX_ORCHESTRATION_LOOPS,
    queueRetryInstruction: (trace, msg) => trace.push({ role: 'retry', content: msg }),
    createNoToolActionError: () => new Error("Model failed to call a tool.")
};

// ─── Pipeline Execution ──────────────────────────────────────────────────────
async function runAgent(sensorData, triggerReason = "") {
    const { salinity, moisture, crop_stage, external_forecast } = sensorData;
    const mongoDb = getDb();
    if (!mongoDb) {
        console.error("[Orchestrator] MongoDB chưa được kết nối.");
        const statusPayload = {
            is_processing: false,
            last_reasoning: "MongoDB chưa được kết nối. Quy trình AI không thể chạy.",
        };
        await fbdb.ref("SalinAI/ai_status").update(statusPayload);
        return { action: "NO_ACTION", reason: "MongoDB chưa được kết nối." };
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
    let researcherProviderUsed = PRIMARY_RESEARCHER_PROVIDER;
    let researcherFailoverApplied = false;
    let activeResearcherAgent = researcherAgent;
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
        addTrace("pipeline", "start", "Bắt đầu pipeline nhiều tác tử", {
            sensor: { salinity, moisture, crop_stage: crop_stage || "VEGETATIVE" },
        });


        const policyPromptBlock = await buildPolicyPromptBlock();
        policyMemoryPreview = truncateText(policyPromptBlock, Math.max(700, Math.floor(MAX_ORCHESTRATOR_OUTPUT_PREVIEW_CHARS * 0.7)));
        policyContextForModel = buildPolicySummaryForOutput(policyPromptBlock);
        addTrace("pipeline", "policy_memory", "Đã nạp policy memory cho Orchestrator", {
            preview: compactText(policyPromptBlock, 220),
        });

        let mandatoryRetrievalContext = "";
        const queries = await generateSearchQueries({ salinity, moisture, crop_stage, external_forecast, trend: triggerReason });
        const queryText = queries.join(" ");

        addTrace("retrieval", "vertex_search_start", "Đang tra cứu kiến thức từ Vertex AI Search", { query: queryText });
        mandatoryRetrievalContext = await querySalinKnowledge(queryText);
        
        // Vertex Search managed citations might not be raw IDs like MongoDB, but we use the summary
        finalHitCount = mandatoryRetrievalContext.includes("Không tìm thấy") ? 0 : 1;
        finalSourceIds = ["VERTEX_KNOWLEDGE_BASE"];
        addTrace("retrieval", "vertex_search_complete", "Đã nhận được kiến thức từ Vertex AI", { hit: finalHitCount > 0 });

        // Optimization: Prepare the final context for the Researcher
        retrievalOutputPreview = mandatoryRetrievalContext;

        console.log("[Subagent] 🕵️ Researcher đang phân tích bằng chứng guideline...");
        const researcherMessages = [
            { role: "system", content: researcherPromptTemplate },
            {
                role: "user",
                content: `Dữ liệu cảm biến hiện tại: độ mặn ${salinity} ppt, độ ẩm đất ${moisture}%, giai đoạn cây ${crop_stage || "VEGETATIVE"}.
Dự báo thời tiết: ${external_forecast?.weather || "Không rõ"} (Lượng mưa 24h: ${external_forecast?.rainfall_24h || 0}mm).
Thủy triều: ${external_forecast?.tide_status || "Không rõ"}.

Hãy phân tích theo kiểu tự nhiên, có chiều sâu hơn, bằng tiếng Việt. Dưới đây là evidence retrieval bắt buộc:
${mandatoryRetrievalContext}`,
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
                    invokeFn: () => activeResearcherAgent.invoke(researcherMessages),
                    iteration: researchLoop,
                });
            } catch (err) {
                if (err?.code === "AGENT_TIMEOUT") {
                    if (!researcherFailoverApplied && fallbackResearcherAgent) {
                        researcherFailoverApplied = true;
                        activeResearcherAgent = fallbackResearcherAgent;
                        researcherProviderUsed = RESEARCHER_FALLBACK_PROVIDER;
                        addTrace("researcher", "provider_failover", "Researcher timeout; chuyển sang provider dự phòng", {
                            from: PRIMARY_RESEARCHER_PROVIDER,
                            to: RESEARCHER_FALLBACK_PROVIDER,
                            iteration: researchLoop,
                            timeout_ms: RESEARCHER_PHASE_TIMEOUT_MS,
                        });
                        continue;
                    }

                    researcherTimedOut = true;
                    researcherRawOutput = `Researcher timeout sau ${RESEARCHER_PHASE_TIMEOUT_MS}ms. Dùng summary dự phòng từ retrieval để tiếp tục Orchestrator.`;
                    addTrace("researcher", "timeout_degraded", "Researcher timeout; chuyển sang chế độ degrade và tiếp tục pipeline", {
                        iteration: researchLoop,
                        timeout_ms: RESEARCHER_PHASE_TIMEOUT_MS,
                        provider: researcherProviderUsed,
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
                console.log(`[Subagent] 📜 Researcher summary ready: "${researcherSummary.substring(0, 200)}..."`);
                break;
            }

            addTrace("researcher", "tool_calls", "Researcher yêu cầu gọi tool", {
                tools: response.tool_calls.map((toolCall) => toolCall.name),
            });

            for (const toolCall of response.tool_calls) {
                if (toolCall.name === "search_agricultural_guidelines") {
                    const ragQuery = String(toolCall.args?.query || "").trim() || queries.join(" ");
                    const ragData = await executeRAGTool(ragQuery, mongoDb, { salinity, moisture, crop_stage });
                    finalHitCount = ragData.hitCount;
                    finalSourceIds = ragData.sourceIds;
                    retrievalOutputPreview = truncateText(ragData.context, MAX_RETRIEVAL_OUTPUT_CHARS);
                    addTrace("retrieval", "rag_result", `Đã truy xuất ${finalHitCount} đoạn guideline`, {
                        source_ids: finalSourceIds,
                        query: ragQuery,
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


        const currentStageUpper = String(crop_stage || "VEGETATIVE").toUpperCase();
        const stageProfile = CROP_STAGE_PROFILES[currentStageUpper] || DEFAULT_STAGE_PROFILE;

        const constraintsBlock = `
[THÔNG TIN THAM KHẢO NỘI BỘ - GIAI ĐOẠN ${currentStageUpper}]:
- Ngưỡng mặn khuyến nghị: < ${stageProfile.salinityMaxSafe} ppt.
- Trọng số ưu tiên: Độ ẩm (${(stageProfile.weights.moisture * 100).toFixed(0)}%) | Độ mặn (${(stageProfile.weights.salinity * 100).toFixed(0)}%).
- Chỉ dẫn phong cách: ĐÂY LÀ THÔNG SỐ NỘI BỘ. Đừng trích dẫn trực tiếp con số "${stageProfile.salinityMaxSafe} ppt" vào lời thoại. Hãy dùng ngôn ngữ tự nhiên như "độ mặn đang ở mức cho phép", "có dấu hiệu chớm mặn", "vượt ngưỡng an toàn" hoặc "môi trường rất thuận lợi". Hãy giải thích dựa trên cảm nhận về sự phù hợp đối với cây lúa thay vì đọc công thức.`;

        const orchestratorMessages = [
            { role: "system", content: `${buildOrchestratorSystemPrompt(sensorData)}\n\n${policyPromptBlock}\n\n${constraintsBlock}` },
            {
                role: "user",
                content: `Dữ liệu cảm biến hiện tại:
- Độ mặn: ${salinity} ppt
- Độ ẩm đất: ${moisture}%
- Giai đoạn cây: ${crop_stage || "VEGETATIVE"}
- Dự báo mưa (24h): ${external_forecast?.rainfall_24h ?? "Không có dữ liệu"} mm
- Thủy triều: ${external_forecast?.tide_status || "Không có dữ liệu"}

Báo cáo từ Researcher:
${researcherSummary}

Tóm tắt đánh giá cũ (policy/outcome memory):
${policyContextForModel || "Chưa có dữ liệu đánh giá cũ."}

Hãy đưa ra quyết định cuối cùng và gọi tool điều khiển van. Viết ngắn gọn nhưng đầy đủ chiều sâu, bằng tiếng Việt. Hãy tư duy như một chuyên gia nông nghiệp đầy kinh nghiệm, biết cân nhắc giữa rủi ro mặn và nhu cầu nước của cây.`,
            },
        ];

        console.log("[Orchestrator] Prompt sizes", {
            system_chars: orchestratorMessages[0].content.length,
            user_chars: orchestratorMessages[1].content.length,
            policy_preview_chars: policyPromptBlock.length,
            researcher_summary_chars: researcherSummary.length,
        });

        let orchestrationLoop = 0;
        const orchestratorRuntimeInfo = getOrchestratorRuntimeInfo();
        while (orchestrationLoop < MAX_ORCHESTRATION_LOOPS) {
            orchestrationLoop++;
            addTrace("orchestrator", "iteration", `Vòng Orchestrator ${orchestrationLoop} bắt đầu`, {
                provider: orchestratorRuntimeInfo.provider,
                model: orchestratorRuntimeInfo.model,
                streaming: orchestratorRuntimeInfo.streaming,
            });
            console.log(
                `[Orchestrator] Invoke start | provider=${orchestratorRuntimeInfo.provider} | model=${orchestratorRuntimeInfo.model} | loop=${orchestrationLoop}`
            );
            const orchestratorInvokeStartedAt = Date.now();
            addTrace("orchestrator", "invoke_start", "Bắt đầu gọi model Orchestrator", {
                provider: orchestratorRuntimeInfo.provider,
                model: orchestratorRuntimeInfo.model,
                system_chars: orchestratorMessages[0].content.length,
                user_chars: orchestratorMessages[1].content.length,
            });
            const response = await invokeWithPhaseTimeoutRetry({
                phaseKey: "orchestrator",
                label: `Orchestrator phase (${orchestratorRuntimeInfo.provider}/${orchestratorRuntimeInfo.model})`,
                timeoutMs: ORCHESTRATOR_PHASE_TIMEOUT_MS,
                invokeFn: () => orchestratorAgent.invoke(orchestratorMessages),
                iteration: orchestrationLoop,
            });
            addTrace("orchestrator", "latency_detail", "Orchestrator invoke xong", {
                provider: orchestratorRuntimeInfo.provider,
                model: orchestratorRuntimeInfo.model,
                duration_ms: Date.now() - orchestratorInvokeStartedAt,
                timeout_ms: ORCHESTRATOR_PHASE_TIMEOUT_MS,
                loop: orchestrationLoop,
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
                    console.log(`[Orchestrator] ⚠️ Không thấy tool_call. Nội dung AI: "${orchestratorContent.substring(0, 150)}..."`);
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
                    // Sanitize args to handle LLM artifacts (like extra quotes or backslashes)
                    if (toolCall.args) {
                        for (const key in toolCall.args) {
                            if (typeof toolCall.args[key] === "string") {
                                toolCall.args[key] = toolCall.args[key].replace(/^["']|["']$/g, "").trim();
                            }
                        }
                    }

                    console.log("[Orchestrator] 🛠️ TOOL CALL ARGS (Sanitized):", JSON.stringify(toolCall.args, null, 2));

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
                researcher_provider: researcherProviderUsed,
                researcher_model:
                    researcherProviderUsed === "saola4_small"
                        ? (process.env.SAOLA4_SMALL_MODEL || "saola4-small")
                        : (process.env.RESEARCHER_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash"),
                orchestrator_provider: String(process.env.AI_PROVIDER || "gemini").toLowerCase(),
                orchestrator_model: (() => {
                    const p = String(process.env.AI_PROVIDER || "gemini").toLowerCase();
                    if (p === "glm4") return process.env.GLM4_MODEL || "GLM-4.7";
                    if (p === "saola4_medium") return process.env.SAOLA4_MEDIUM_MODEL || "SaoLa4-medium";
                    return process.env.GEMINI_MODEL || "gemini-2.5-flash";
                })(),
            },
        });

        // Log moved to finalizeAction for better consolidation.
        return {
            action: actionResult.executed_state,
            reason: actionResult.reason,
            suggested_thresholds: actionResult.suggested_thresholds,
            source_ids: actionResult.source_ids
        };

    } catch (err) {
        normalizePipelineError(err);

        addTrace("pipeline", "error", err.message, {
            code: err.code || "UNKNOWN_ERROR",
        });

        try {
            const fallbackAction = await tryFinalizeFallback({
                err,
                sensorData,
                finalizeAction,
                buildFallbackAction,
                addTrace,
                mongoDb,
                agentTrace,
            });

            console.warn(`[Orchestrator] ⚠️ Dùng fallback action do lỗi pipeline: ${err.message}`);
            return {
                action: fallbackAction.executed_state,
                reason: fallbackAction.reason,
                is_fallback: true
            };
        } catch (fallbackErr) {
            console.error("[Orchestrator] Fallback action failed:", fallbackErr.message);
        }

        const statusPayload = {
            is_processing: false,
            last_reasoning: `Lỗi trong pipeline AI: ${err.message}`,
        };
        await fbdb.ref("SalinAI/ai_status").update(statusPayload);

        throw err;
    }
}
/**
 * runAgentStreaming
 * Identical logic to runAgent but streams orchestrator tokens to Socket.io.
 */
async function runAgentStreaming(sensorData, triggerReason = "") {
    const { salinity, moisture, crop_stage, external_forecast } = sensorData;
    const mongoDb = getDb();
    if (!mongoDb) {
        failAiStreamSession("MongoDB not connected");
        emitAiStatus("error", { message: "MongoDB not connected" });
        return runAgent(sensorData, triggerReason);
    }

    startAiStreamSession({ sensorData, triggerReason });

    emitAiStatus("start", { phase: "pipeline" });

    let finalHitCount = 0;
    let finalSourceIds = [];
    let researcherSummary = "";
    let actionResult = null;
    let researcherRawOutput = "";
    let orchestratorRawOutput = "";
    let orchestratorArgumentReason = "";
    let retrievalOutputPreview = "";
    const agentTrace = [];

    const utils = createAgentUtilsService({
        maxInsightChars: MAX_INSIGHT_CHARS,
        maxFullOutputChars: MAX_FULL_OUTPUT_CHARS,
        maxOrchestratorOutputPreviewChars: MAX_ORCHESTRATOR_OUTPUT_PREVIEW_CHARS,
    });

    const addTrace = (phase, event, message, meta = {}) => {
        if (agentTrace.length >= MAX_TRACE_STEPS) return;
        agentTrace.push({
            timestamp: toVietnamISOString(),
            phase,
            event,
            message,
            meta,
        });
    };

    try {

        // 1. Policy Memory
        emitAiStatus("processing", { phase: "pipeline", message: "🧠 Đang nạp trí nhớ bài học (Policy Memory)..." });
        const policyPromptBlock = await buildPolicyPromptBlock();

        // 2. Vertex AI Search
        emitAiStatus("processing", { phase: "retrieval", message: "📚 Đang tra cứu kiến thức chuyên sâu từ Vertex AI..." });
        const queries = await generateSearchQueries({ salinity, moisture, crop_stage, external_forecast, trend: triggerReason });
        const queryText = queries.join(" ");

        const vertexContext = await querySalinKnowledge(queryText);
        finalHitCount = vertexContext.includes("Không tìm thấy") ? 0 : 1;
        finalSourceIds = ["VERTEX_KNOWLEDGE_BASE"];
        const mandatoryRetrievalContext = vertexContext;
        retrievalOutputPreview = truncateText(mandatoryRetrievalContext, MAX_RETRIEVAL_OUTPUT_CHARS);

        // 3. Researcher
        emitAiStatus("processing", { phase: "researcher", message: `🕵️ Researcher đang đối soát dữ liệu với ${finalSourceIds.length} tài liệu hướng dẫn...` });
        const researcherMessages = [
            { role: "system", content: researcherPromptTemplate },
            {
                role: "user",
                content: `Dữ liệu cảm biến hiện tại: độ mặn ${salinity} ppt, độ ẩm đất ${moisture}%, giai đoạn cây ${crop_stage || "VEGETATIVE"}.
Dự báo thời tiết: ${external_forecast?.weather || "Không rõ"} (Lượng mưa 24h: ${external_forecast?.rainfall_24h || 0}mm).
Thủy triều: ${external_forecast?.tide_status || "Không rõ"}.

Hãy phân tích theo kiểu tự nhiên, có chiều sâu bằng tiếng Việt. Tập trung vào việc đối chiếu dữ liệu cảm biến trên với các guideline dưới đây để tìm bằng chứng hành động:
${mandatoryRetrievalContext}`,
            },
        ];

        let researchLoop = 0;
        const MAX_RESEARCH_LOOPS = 3;
        while (researchLoop < MAX_RESEARCH_LOOPS) {
            researchLoop++;
            const resResponse = await researcherAgent.invoke(researcherMessages);
            researcherMessages.push(resResponse);

            const content = utils.stripThinkTags(utils.toText(resResponse?.content));
            if (!resResponse.tool_calls || resResponse.tool_calls.length === 0) {
                researcherRawOutput = content;
                researcherSummary = utils.ensureResearcherCitations(content, finalSourceIds);
                break;
            }

            // Handle researcher tool calls if any (e.g. RAG)
            for (const toolCall of resResponse.tool_calls) {
                const toolInstance = researcherTools.find((t) => t.name === toolCall.name);
                if (toolInstance) {
                    let toolResult;
                    if (toolCall.name === "search_agricultural_guidelines") {
                        const queryStr = toolCall.args.query || `Ngưỡng mặn lúa giai đoạn ${crop_stage}`;
                        const ragData = await executeRAGTool(queryStr, mongoDb, { salinity, moisture });
                        finalHitCount = ragData.hitCount;
                        finalSourceIds = ragData.sourceIds;
                        retrievalOutputPreview = truncateText(ragData.context, MAX_RETRIEVAL_OUTPUT_CHARS);
                        toolResult = ragData.context;
                    } else {
                        toolResult = await toolInstance.invoke(toolCall.args);
                    }

                    researcherMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                        content: toolResult,
                    });
                }
            }
        }
        console.log(`[Pipeline] 🔍 Researcher đã hoàn thành với ${finalHitCount} nguồn.`);

        // 4. Orchestrator Phase 1: Detailed Analysis (Streaming)
        console.log("[Pipeline] 🤖 Bắt đầu phase Orchestrator (Detailed Analysis)...");
        emitAiStatus("processing", { phase: "orchestrator", message: "🤖 Orchestrator bắt đầu lập luận chuyên sâu..." });

        const { orchestratorDetailedPromptTemplate, orchestratorSummaryPromptTemplate } = require("./prompt");

        const detailedAnalysisMessages = [
            { role: "system", content: `${orchestratorDetailedPromptTemplate}\n\n${policyPromptBlock}` },
            {
                role: "user",
                content: `
Báo cáo Researcher: ${researcherSummary}

[Dữ Liệu Hiện Tại]
- Độ mặn: ${salinity} ppt
- Độ ẩm đất: ${moisture}%
- Giai đoạn cây: ${crop_stage || "VEGETATIVE"}
- Thời tiết: ${external_forecast?.weather || "Không rõ"}
- Lượng mưa 24h: ${external_forecast?.rainfall_24h || 0} mm
- Thủy triều: ${external_forecast?.tide_status || "Không rõ"}`,
            },
        ];

        // STREAMING START (Phase 1)
        const stream = await orchestratorAgent.stream(detailedAnalysisMessages);
        let gatheredDetailedAnalysis = "";

        try {
            let tokenCount = 0;
            for await (const chunk of stream) {
                if (chunk.content) {
                    const token = typeof chunk.content === "string" ? chunk.content : utils.toText(chunk.content);
                    gatheredDetailedAnalysis += token;
                    emitToken(token, "orchestrator");

                    tokenCount++;
                    // Chỉ update Firebase mỗi 15 tokens để tránh spam database gây rate-limit hoặc nghẽn cổ chai
                    if (tokenCount % 15 === 0) {
                        fbdb.ref("SalinAI/ai_status").update({ last_reasoning: gatheredDetailedAnalysis }).catch(() => { });
                    }
                }
            }
            // Đảm bảo update lần cuối khi stream kết thúc
            fbdb.ref("SalinAI/ai_status").update({ last_reasoning: gatheredDetailedAnalysis }).catch(() => { });
        } catch (streamErr) {
            throw streamErr;
        }

        orchestratorRawOutput = gatheredDetailedAnalysis;
        console.log("[Pipeline] 🤖 Orchestrator đã hoàn thành phân tích chi tiết.");

        // 5. Orchestrator Phase 2: Final Summary & Tool Call (Decision)
        console.log("[Pipeline] 🎯 Bắt đầu phase Orchestrator (Decision)...");
        emitAiStatus("processing", { phase: "orchestrator", message: "Đang chốt quyết định cuối cùng..." });

        const summaryDecisionMessages = [
            { role: "system", content: orchestratorSummaryPromptTemplate },
            {
                role: "user",
                content: `Phân tích chi tiết: ${gatheredDetailedAnalysis}\n\nBằng chứng từ Researcher: ${researcherSummary}`,
            },
        ];

        const summaryResponse = await orchestratorAgent.invoke(summaryDecisionMessages);

        // Handle tool call for final decision
        if (summaryResponse.tool_calls && summaryResponse.tool_calls.length > 0) {
            const toolCall = summaryResponse.tool_calls[0];
            const toolInstance = orchestratorTools.find((t) => t.name === toolCall.name);
            if (toolInstance) {
                const rawOutput = await toolInstance.invoke(toolCall.args);
                actionResult = JSON.parse(rawOutput);
            }
        } else {
            // Fallback parsing if no tool call
            const content = utils.toText(summaryResponse.content);
            const state = utils.parseDecisionFromText(content);
            const toolInstance = orchestratorTools.find((t) => t.name === "execute_valve_control");
            const rawOutput = await toolInstance.invoke({
                state,
                reason: content.slice(0, 150),
                source_ids: (finalSourceIds || []).map((id) => String(id)),
            });
            actionResult = JSON.parse(rawOutput);
        }

        actionResult.reason = utils.normalizeFarmerReason(actionResult.reason);

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
                orchestrator_output_preview: orchestratorRawOutput,
                orchestrator_reasoning_summary: actionResult.reason,
                researcher_output_preview: researcherRawOutput,
                retrieval_output_preview: retrievalOutputPreview
            }
        });

        console.log(`[Pipeline] ✅ Quyết định cuối cùng: ${actionResult.executed_state}`);
        emitAiStatus("done", { phase: "pipeline" });
        completeAiStreamSession({ action: actionResult.executed_state, reason: actionResult.reason });
        return {
            action: actionResult.executed_state,
            reason: actionResult.reason
        };

    } catch (err) {
        console.error("[Streaming Pipeline] Error:", err.message);
        emitAiStatus("error", { message: err.message });
        failAiStreamSession(err.message);
        // Safe fallback
        return { action: "NO_ACTION", reason: `Lỗi streaming: ${err.message}` };
    }
}

module.exports = { runAgent, runAgentStreaming };
