const fbdb = require("../../config/firebase");
const { CROP_STAGE_PROFILES, DEFAULT_STAGE_PROFILE } = require("../ai/outcomeService");

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

    const desiredState = salinity >= safeThreshold ? "CLOSED" : "OPEN";
    
    const actuatorSnap = await fbdb.ref("SalinAI/actuator").once("value");
    const actuator = actuatorSnap.val() || {};
    const blockedByManual = actuator.control_mode === "MANUAL";

    const reason = generateRealisticFallbackReason(sensorData, desiredState);

    return {
        executed_state: desiredState,
        reason, // Lý do "diễn sâu" cho UI
        tech_reason: techReason, // Lý do kỹ thuật thực tế cho backend
        source_ids: [],
        blocked_by_manual: blockedByManual,
    };
}

function generateRealisticFallbackReason(sensorData, state) {
    const salinity = Number(sensorData?.salinity || 0);
    const moisture = Number(sensorData?.moisture || 0);
    const stage = String(sensorData?.crop_stage || "VEGETATIVE");

    const stageNames = {
        "SEEDLING": "mạ non",
        "VEGETATIVE": "sinh trưởng",
        "FLOWERING": "trổ bông",
        "HARVEST": "sắp thu hoạch"
    };
    const vnStage = stageNames[stage] || "phát triển";

    // Danh sách các "mở bài" tự nhiên
    const openers = [
        "Dựa trên các chỉ số quan trắc hiện tại,",
        "Sau khi phân tích dữ liệu từ cảm biến,",
        "Cân nhắc điều kiện thực tế tại ruộng,",
        "Theo dõi biến động môi trường lúc này,",
        "Nhận định tình hình nguồn nước,"
    ];
    const opener = openers[Math.floor(Math.random() * openers.length)];

    if (state === "CLOSED") {
        const closedReasons = [
            `${opener} tôi nhận thấy nồng độ mặn đang ở mức ${salinity} ppt, vượt ngưỡng chịu đựng của cây lúa giai đoạn ${vnStage}. Để bảo vệ bộ rễ và tránh rủi ro ngộ độc phèn mặn, tôi quyết định đóng van ngăn mặn ngay lập tức.`,
            `${opener} chỉ số mặn ${salinity} ppt là mối đe dọa trực tiếp cho ruộng lúa ${vnStage}. Tôi ưu tiên việc đóng van để duy trì độ ngọt cho nội đồng, ngăn ngừa hiện tượng xâm nhập mặn bất thường.`,
            `${opener} với nồng độ mặn ${salinity} ppt, việc tiếp tục mở van sẽ gây nguy hiểm. Tôi thực hiện đóng van để đảm bảo an toàn tối đa cho sự phát triển của cây.`
        ];
        return closedReasons[Math.floor(Math.random() * closedReasons.length)];
    } 

    if (state === "OPEN") {
        // Tình huống 1: Khô hạn nhưng nước ngọt
        if (moisture < 45) {
            return `${opener} độ mặn ${salinity} ppt rất an toàn nhưng độ ẩm đất (${moisture}%) đang ở mức báo động khô. Tôi quyết định mở van để cấp nước ngọt kịp thời, giúp cây lúa giai đoạn ${vnStage} không bị sốc nhiệt và thiếu nước.`;
        }
        // Tình huống 2: Nước ngọt và nước đang hồi phục
        if (salinity < 1.0) {
            return `${opener} nguồn nước đã hoàn toàn ngọt trở lại (${salinity} ppt). Tôi nhận thấy đây là thời điểm lý tưởng để mở van, thau rửa phèn và làm sạch đồng ruộng cho lúa giai đoạn ${vnStage}.`;
        }
        // Tình huống 3: Bình thường
        return `${opener} nồng độ mặn (${salinity} ppt) nằm trong ngưỡng an toàn tuyệt đối. Tôi khuyến nghị giữ van mở để tối ưu hóa việc lưu thông nước, tạo điều kiện tốt nhất cho lúa hấp thụ dưỡng chất.`;
    }

    return `${opener} các chỉ số môi trường (Mặn: ${salinity} ppt, Ẩm: ${moisture}%) đều nằm trong tầm kiểm soát. Tôi quyết định giữ nguyên trạng thái vận hành để ổn định hệ sinh thái ruộng lúa.`;
}

module.exports = {
    isQuotaError,
    parseRetrySeconds,
    withTimeout,
    buildFallbackAction,
};
