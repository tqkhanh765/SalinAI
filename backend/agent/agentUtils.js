const fbdb = require("../config/firebase");

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

async function buildFallbackAction(sensorData, reason) {
    const salinity = Number(sensorData?.salinity || 0);
    const desiredState = salinity >= 2 ? "CLOSED" : "OPEN";
    const actuatorSnap = await fbdb.ref("actuator").once("value");
    const actuator = actuatorSnap.val() || {};
    const blockedByManual = actuator.control_mode === "MANUAL";

    return {
        executed_state: desiredState,
        reason,
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
