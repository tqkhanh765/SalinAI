function createLangchainResilienceService(options) {
    const {
        maxOrchestrationLoops,
        maxFullOutputChars,
        isQuotaError,
        parseRetrySeconds,
        buildFallbackAction,
        finalizeAction,
        buildOrchestratorOutputPreview,
        buildReasoningSummary,
        truncateText,
    } = options;

    const isRetryableAttempt = (attempt) => attempt < maxOrchestrationLoops;

    const queueRetryInstruction = ({ orchestratorMessages, buildRetryPrompt, attempt, issue, lastOutput }) => {
        orchestratorMessages.push({
            role: "user",
            content: buildRetryPrompt({
                attempt,
                maxAttempts: maxOrchestrationLoops,
                issue,
                lastOutput,
            }),
        });
    };

    const createNoToolActionError = () => {
        const noActionError = new Error("Orchestrator không trả về hành động van có thể thực thi.");
        noActionError.code = "NO_TOOL_ACTION";
        return noActionError;
    };

    const normalizePipelineError = (err) => {
        if (isQuotaError(err)) {
            const retrySeconds = parseRetrySeconds(err);
            const retryHint = retrySeconds ? ` Thử lại sau khoảng ${retrySeconds}s.` : "";
            err.message = `Vượt hạn mức model.${retryHint}`;
            err.code = err.code || "MODEL_QUOTA";
        }

        if (err?.code === "AGENT_TIMEOUT") {
            err.message = `${err.message}. Không dùng fallback.`;
        }

        return err;
    };

    const tryFinalizeFallback = async ({
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
    }) => {
        const fallbackReason = `Hệ thống tự động tối ưu hóa trạng thái dựa trên ràng buộc an toàn (Nguyên nhân: ${err.message})`;
        const fallbackAction = await buildFallbackAction(sensorData, fallbackReason);


        addTrace("orchestrator", "decision", "Đã kích hoạt fallback action để đảm bảo hệ thống không treo", {
            state: fallbackAction.executed_state,
            fallback: true,
            blocked_by_manual: fallbackAction.blocked_by_manual,
        });

        await finalizeAction({
            actionResult: fallbackAction,
            sensorData,
            finalHitCount,
            finalSourceIds,
            researcherSummary: researcherSummary || "Fallback path: không có bản tóm tắt Researcher đầy đủ.",
            actor: "FALLBACK_AGENT",
            mongoDb,
            agentTrace,
            modelInsights: {
                researcher_output_preview: researcherRawOutput,
                orchestrator_output_preview: buildOrchestratorOutputPreview({
                    rawOutput: orchestratorRawOutput,
                    toolReason: orchestratorArgumentReason || fallbackAction.reason,
                    researcherSummary,
                    action: fallbackAction.executed_state,
                }),
                orchestrator_reasoning_summary: buildReasoningSummary(fallbackAction.reason, fallbackAction.executed_state),
                orchestrator_tool_reason: truncateText(orchestratorArgumentReason, maxFullOutputChars),
                retrieval_output_preview: retrievalOutputPreview,
                fallback: true,
                fallback_error: String(err.message || "unknown"),
            },
        });

        return fallbackAction;
    };

    return {
        isRetryableAttempt,
        queueRetryInstruction,
        createNoToolActionError,
        normalizePipelineError,
        tryFinalizeFallback,
    };
}

module.exports = { createLangchainResilienceService };
