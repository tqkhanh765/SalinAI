/**
 * AGENT UTILITIES SERVICE (PLUMBING)
 * 
 * Tác dụng: Cung cấp các công cụ bổ trợ cho Agent như: dọn dẹp text từ Model, 
 * trích xuất quyết định (OPEN/CLOSED), format dữ liệu cho UI, và xử lý 
 * các kịch bản lỗi (Resilience/Fallback) để đảm bảo pipeline AI không bị treo.
 */

const { buildOrchestratorRetryPrompt } = require("../../agent/prompt");

function createAgentUtilsService(config = {}) {
    const maxInsightChars = config.maxInsightChars || 800;
    const maxFullOutputChars = config.maxFullOutputChars || 12000;
    const maxPreviewChars = config.maxOrchestratorOutputPreviewChars || 1600;

    // --- Formatting & Parsing Tools ---

    const toText = (value) => {
        if (typeof value === "string") return value;
        if (Array.isArray(value)) return value.map(i => i.text || i.content || "").join("\n");
        return String(value || "");
    };

    const truncateText = (value, maxLen = maxFullOutputChars) => {
        const text = toText(value).trim();
        return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
    };

    const compactText = (value, maxLen = maxInsightChars) => {
        const normalized = String(value || "").replace(/\s+/g, " ").trim();
        if (!normalized) return "";
        if (normalized.length <= maxLen) return normalized;
        return `${normalized.slice(0, maxLen).trim()}...`;
    };

    const stripThinkTags = (text) => {
        return String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    };

    const parseDecisionFromText = (text) => {
        const cleaned = stripThinkTags(text).toUpperCase();
        if (cleaned.includes("ACTION: OPEN") || cleaned.includes('"STATE": "OPEN"')) return "OPEN";
        if (cleaned.includes("ACTION: CLOSED") || cleaned.includes('"STATE": "CLOSED"')) return "CLOSED";
        return "NO_ACTION";
    };

    const cleanModelArtifacts = (value) => {
        const text = toText(value);
        return text
            .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
            .replace(/<\|end_of_text\|>:\/\/[\s\S]*$/gi, "")
            .trim();
    };

    const buildReasoningSummary = (reason, action) => {
        const prefix = `[XÁC NHẬN: ${action === "OPEN" ? "MỞ VAN" : "ĐÓNG VAN"}] `;
        return prefix + (reason || "Không có lý do cụ thể.");
    };

    const buildOrchestratorOutputPreview = ({ rawOutput, toolReason }) => {
        const cleanRaw = cleanModelArtifacts(rawOutput);
        const reasoningPart = toolReason ? `\n\n[TOOL_REASONING]: ${toolReason}` : "";
        const final = `[RAW_OUTPUT]: ${cleanRaw}${reasoningPart}`;
        return final.length > maxPreviewChars ? `${final.slice(0, maxPreviewChars)}...` : final;
    };

    const buildPolicySummaryForOutput = (block) => {
        if (!block) return "No feedback policy memory found.";
        return truncateText(block, 1200);
    };

    const ensureResearcherCitations = (text) => {
        const cleaned = stripThinkTags(text);
        if (cleaned.includes("[") && cleaned.includes("]")) return cleaned;
        return cleaned + "\n\n(Nguồn: Tổng hợp từ tài liệu hướng dẫn)";
    };

    const normalizeFarmerReason = (text) => {
        return String(text || "").trim() || "Không có lý do cụ thể.";
    };

    // --- Resilience Tools ---

    const normalizePipelineError = (err) => {
        const msg = String(err?.message || "").toLowerCase();
        if (msg.includes("quota") || msg.includes("too many requests")) {
            err.message = "Vượt hạn mức model. Thử lại sau.";
            err.code = "MODEL_QUOTA";
        }
        return err;
    };

    const tryFinalizeFallback = async ({
        err,
        sensorData,
        finalizeAction,
        buildFallbackAction,
        addTrace,
        mongoDb,
        agentTrace
    }) => {
        console.warn(`[FALLBACK] ⚠️ Lỗi pipeline: ${err.message}`);

        // Handle direct function or object property
        const fallbackFn = typeof buildFallbackAction === 'function' ? buildFallbackAction : null;

        if (!fallbackFn) {
            console.error("[FALLBACK] Critical: buildFallbackAction is missing.");
            return { executed_state: "CLOSED", reason: "Lỗi hệ thống nghiêm trọng (Fallback failed)" };
        }

        const fallbackAction = await fallbackFn(sensorData, err.message);
        
        addTrace("orchestrator", "decision", "Đã kích hoạt fallback action", {
            state: fallbackAction.executed_state,
            tech_reason: err.message
        });

        await finalizeAction({
            actionResult: fallbackAction,
            sensorData,
            actor: "FALLBACK_AGENT",
            mongoDb,
            agentTrace,
        });

        return fallbackAction;
    };

    return {
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
    };
}

module.exports = { createAgentUtilsService };
