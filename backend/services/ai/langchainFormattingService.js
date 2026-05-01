const { buildOrchestratorRetryPrompt } = require("../../agent/prompt");

function createLangchainFormattingService(config = {}) {
    const maxInsightChars = Math.max(50, parseInt(config.maxInsightChars || "800", 10));
    const maxFullOutputChars = Math.max(200, parseInt(config.maxFullOutputChars || "12000", 10));
    const maxOrchestratorOutputPreviewChars = Math.max(200, parseInt(config.maxOrchestratorOutputPreviewChars || "1600", 10));

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

    const compactText = (value, maxLen = maxInsightChars) => {
        const normalized = String(value || "").replace(/\s+/g, " ").trim();
        if (!normalized) return "";
        if (normalized.length <= maxLen) return normalized;

        const sliceWithBuffer = normalized.slice(0, maxLen + 1);
        const lastSpace = sliceWithBuffer.lastIndexOf(" ");
        const safeEnd = lastSpace > Math.floor(maxLen * 0.6) ? lastSpace : maxLen;
        return `${normalized.slice(0, safeEnd).trim()}...`;
    };

    const truncateText = (value, maxLen = maxFullOutputChars) => {
        const text = String(value || "").trim();
        if (!text) return "";
        return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
    };

    const cleanModelArtifacts = (value) => {
        const text = String(value || "");
        return text
            .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
            .replace(/<\|end_of_text\|>:\/\/[\s\S]*$/gi, "")
            .replace(/<\|end_of_text\|>/gi, "")
            .replace(/```[\s\S]*?```/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    };

    const extractOrchestratorNarrative = (value) => {
        const cleaned = cleanModelArtifacts(value);
        if (!cleaned) return "";

        const decisionIndex = cleaned.search(/\n\s*(Quyết định|Lý do|Nguồn)\s*:/i);
        return decisionIndex > 0 ? cleaned.slice(0, decisionIndex).trim() : cleaned;
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

    const buildReasoningSummary = (reason, action) => {
        const friendlyLabels = {
            "OPEN": "MỞ VAN",
            "CLOSED": "ĐÓNG VAN",
            "NO_ACTION": "duy trì trạng thái hiện tại"
        };
        const actionLabel = friendlyLabels[String(action || "NO_ACTION").toUpperCase()] || "duy trì trạng thái";
        
        const cleanedReason = String(reason || "Không có lý do cụ thể")
            .replace(/^Đã phân tích từ văn bản Orchestrator:\s*/i, "")
            .replace(/\s+/g, " ")
            .trim();

        // Không cắt theo "tuy nhiên/nhưng" nữa để tránh mất logic vế sau
        const firstSentence = cleanedReason.split(/[.!?](?=\s|$)/)[0].trim();
        const reasonCore = firstSentence || cleanedReason;

        const conciseReason = compactText(reasonCore, 280).replace(/[.\s]+$/g, "");
        
        // Nếu là duy trì, dùng từ ngữ mang tính tiếp diễn
        if (String(action).toUpperCase() === "NO_ACTION") {
            return `${conciseReason}, nên hệ thống ${actionLabel}.`;
        }
        return `${conciseReason}. Vì vậy hệ thống chọn ${actionLabel}.`;
    };

    const buildPolicySummaryForOutput = (policyText) => {
        const text = String(policyText || "").replace(/\r/g, "").trim();
        if (!text) return "";

        const summaryMatch = text.match(/SUMMARY:\s*([^\n]+)/i);
        const statsMatch = text.match(/STATS:\s*([^\n]+)/i);
        const reviewed = statsMatch?.[1]?.match(/reviewed=(\d+)/i)?.[1];
        const correct = statsMatch?.[1]?.match(/correct=(\d+)/i)?.[1];
        const incorrect = statsMatch?.[1]?.match(/incorrect=(\d+)/i)?.[1];
        const accuracy = statsMatch?.[1]?.match(/accuracy=([\d.]+%?)/i)?.[1];

        const cases = text
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => /^\d+\./.test(line))
            .slice(0, 2)
            .map((line) => {
                const verdict = (line.match(/verdict=([^;|]+)/i)?.[1] || "N/A").trim();
                const observed = (line.match(/observed=([^;|]+)/i)?.[1] || "N/A").trim();
                const salinity = (line.match(/salinity=([^;|]+)/i)?.[1] || "?").trim();
                const moisture = (line.match(/moisture=([^;|]+)/i)?.[1] || "?").trim();
                return { verdict, observed, salinity, moisture };
            });

        const summaryText = (summaryMatch?.[1] || "")
            .replace(/Recent performance:/gi, "Hiệu năng gần đây:")
            .replace(/reviewed cases were correct/gi, "ca đã đánh giá là đúng")
            .replace(/No recent incorrect cases detected; continue following guideline evidence and safety constraints\.?/gi, "Chưa ghi nhận ca sai gần đây; tiếp tục ưu tiên bằng chứng guideline và ràng buộc an toàn.")
            .trim();

        const summaryLine = summaryText ? `- Nhận định gần đây: ${summaryText}` : "";
        const statsLine = (reviewed || correct || incorrect || accuracy)
            ? `- Số liệu tổng hợp: ${correct || "?"}/${reviewed || "?"} ca đúng, ${incorrect || "?"} ca chưa đúng, độ chính xác ${accuracy || "N/A"}.`
            : "";
        const caseLine = cases.length > 0
            ? `- Ví dụ gần nhất: ${cases.map((c, idx) => `Ca ${idx + 1} (${c.verdict}): ${c.observed} tại độ mặn ${c.salinity} ppt, độ ẩm ${c.moisture}%.`).join(" ")}`
            : "";

        return [summaryLine, statsLine, caseLine].filter(Boolean).join("\n");
    };

    const buildOrchestratorOutputPreview = ({ rawOutput, toolReason, researcherSummary, action }) => {
        const cleanRaw = truncateText(extractOrchestratorNarrative(rawOutput || ""), maxOrchestratorOutputPreviewChars);
        const cleanToolReason = compactText(toolReason || "", 320);
        const cleanResearcher = compactText(researcherSummary || "", 500);
        const actionLabel = String(action || "NO_ACTION").toUpperCase();

        if (cleanRaw && cleanRaw.length >= 80) {
            return cleanRaw;
        }

        if (cleanResearcher && cleanToolReason) {
            return `Từ phần phân tích của Researcher: ${cleanResearcher} Dựa trên bối cảnh hiện tại, Orchestrator kết luận ${cleanToolReason} (kết quả: ${actionLabel}).`;
        }

        return cleanRaw || cleanToolReason || "Không có output thô từ Orchestrator trong log này.";
    };

    const normalizeFarmerReason = (reason, state = "NO_ACTION") => {
        const cleaned = cleanModelArtifacts(String(reason || "")).replace(/^Đã phân tích từ văn bản Orchestrator:\s*/i, "").trim();
        const concise = compactText(cleaned, 170);
        if (concise) return concise;

        const action = String(state || "NO_ACTION").toUpperCase();
        if (action === "OPEN") return "Điều kiện hiện tại cho thấy cần cấp nước để bảo vệ cây trồng.";
        if (action === "CLOSED" || action === "CLOSE") return "Điều kiện hiện tại có rủi ro nên tạm đóng van để an toàn hơn.";
        return "Điều kiện chưa yêu cầu thay đổi trạng thái van ở thời điểm này.";
    };


    const ensureResearcherCitations = (text, sourceIds = []) => {
        const normalized = String(text || "").trim();
        const validIds = Array.isArray(sourceIds) ? sourceIds.filter(Boolean).map((id) => String(id)) : [];
        if (!normalized) return normalized;
        if (validIds.length === 0) return normalized;

        const hasRealCitation = validIds.some((id) => normalized.includes(id));
        const usesPlaceholder = /guideline\s*[xyz]|nguồn\s*[xyz]|paper\s*[xyz]/i.test(normalized);

        if (hasRealCitation && !usesPlaceholder) {
            return normalized;
        }

        const citationBlock = `\n\nNguồn đã dùng: ${validIds.join(", ")}.`;
        return `${normalized}${citationBlock}`;
    };

    const parseDecisionFromText = (content) => {
        const text = cleanModelArtifacts(toText(content));
        if (!text) return null;

        const safetyDecision = text.match(/(?:safety\s*decision)\s*:\s*(OPEN|CLOSED|NO_ACTION)/i);
        let state = safetyDecision ? safetyDecision[1].toUpperCase() : null;

        if (!state) {
            // Use a more permissive search for Vietnamese keys as \b might fail with accents
            const textUpper = text.toUpperCase();
            if (textUpper.includes("MỞ") || textUpper.includes("NÊN MỞ") || textUpper.includes("CẦN MỞ") || textUpper.includes("HÃY MỞ")) {
                state = "OPEN";
            } else if (textUpper.includes("ĐÓNG") || textUpper.includes("NÊN ĐÓNG") || textUpper.includes("CẦN ĐÓNG") || textUpper.includes("HÃY ĐÓNG") || textUpper.includes("CLOSE")) {
                state = "CLOSED";
            } else if (textUpper.includes("GIỮ NGUYÊN") || textUpper.includes("DUY TRÌ") || textUpper.includes("KHÔNG LÀM GÌ") || textUpper.includes("KHÔNG THAY ĐỔI") || textUpper.includes("NO_ACTION")) {
                state = "NO_ACTION";
            } else {
                const explicitState = text.match(/\b(OPEN|CLOSED|NO_ACTION|CLOSE)\b/i);
                if (explicitState) {
                    const token = explicitState[1].toUpperCase();
                    state = token === "CLOSE" ? "CLOSED" : token;
                }
            }
        }

        if (!state) return null;

        const narrative = extractOrchestratorNarrative(text);
        return {
            state,
            reason: compactText(narrative || text, 260),
        };
    };

    return {
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
    };
}

module.exports = { createLangchainFormattingService };
