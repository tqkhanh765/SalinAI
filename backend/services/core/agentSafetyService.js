const fbdb = require("../../config/firebase");
const { CROP_STAGE_PROFILES, DEFAULT_STAGE_PROFILE } = require("../ai/outcomeService");
const { buildFallbackReason } = require("../../agent/prompt");

function isQuotaError(err) {
    const status = err?.status;
    const text = String(err?.message || "").toLowerCase();
    return status === 429 || text.includes("quota") || text.includes("too many requests");
}

function parseRetrySeconds(err) {
    const details = err?.errorDetails || [];
    const retryInfo = details.find((d) => d?.["@type"]?.includes("RetryInfo"));
    const retryDelay = retryInfo?.retryDelay;
    if (typeof retryDelay === "string") {
        const parsed = parseInt(retryDelay.replace("s", ""), 10);
        if (Number.isFinite(parsed)) return parsed;
    }

    const message = String(err?.message || "");
    const match = message.match(/retry in\s+([\d.]+)s/i);
    if (match) {
        const parsed = Math.ceil(Number(match[1]));
        if (Number.isFinite(parsed)) return parsed;
    }

    return null;
}

async function withTimeout(promise, timeoutMs, label) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const error = new Error(`${label} timed out after ${timeoutMs}ms`);
            error.code = "AGENT_TIMEOUT";
            reject(error);
        }, timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeoutId);
    }
}

async function buildFallbackAction(sensorData, techReason) {
    const salinity = Number(sensorData?.salinity || 0);
    const moisture = Number(sensorData?.moisture || 0);
    const stage = String(sensorData?.crop_stage || "VEGETATIVE").toUpperCase();

    // Lấy profile thực tế từ Outcome Service để đồng bộ logic
    const profile = CROP_STAGE_PROFILES[stage] || DEFAULT_STAGE_PROFILE;
    const safeThreshold = profile.salinityMaxSafe;
    const rainfall = Number(sensorData?.rainfall_24h || sensorData?.external_forecast?.rainfall_24h || 0);

    let desiredState = "CLOSED";
    if (salinity < safeThreshold) {
        // Giai đoạn HARVEST (Chín/Thu hoạch) bắt buộc phải siết nước (ĐÓNG), dù đất khô hay nước ngọt.
        if (stage === "HARVEST" || stage === "RIPENING") {
            desiredState = "CLOSED";
        }
        // "Sweet Water Trap" fallback: Nếu sắp mưa to (>20mm) và đất không quá khô (>30%), hãy ưu tiên ĐÓNG để hứng nước trời.
        else if (rainfall > 20 && moisture > 30) {
            desiredState = "CLOSED";
        } else {
            desiredState = "OPEN";
        }
    }
    
    const actuatorSnap = await fbdb.ref("SalinAI/actuator").once("value");
    const actuator = actuatorSnap.val() || {};
    const blockedByManual = actuator.control_mode === "MANUAL";

    const reason = buildFallbackReason(sensorData, desiredState);

    return {
        executed_state: desiredState,
        reason, // Lý do "diễn sâu" cho UI
        tech_reason: techReason, // Lý do kỹ thuật thực tế cho backend
        source_ids: [],
        blocked_by_manual: blockedByManual,
    };
}

module.exports = {
    isQuotaError,
    parseRetrySeconds,
    withTimeout,
    buildFallbackAction,
};
