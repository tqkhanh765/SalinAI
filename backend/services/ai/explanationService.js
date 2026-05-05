/**
 * DECISION EXPLANATION SERVICE
 * 
 * Tác dụng: Chuyển đổi các kết quả phân tích kỹ thuật của AI thành ngôn ngữ
 * dễ hiểu cho nông dân trên Dashboard. Xử lý định dạng hiển thị cho các 
 * chỉ số và bằng chứng guideline.
 */
const { CROP_STAGE_PROFILES, DEFAULT_STAGE_PROFILE } = require("../../config/crops");
const { toVietnamISOString } = require("../../utils/vietnamTime");

/**
 * Build a user-friendly explanation of the final decision.
 */
function buildDetailedExplanation(sensorData, weatherData, tideData, guidelines, decision) {
    const factors = [];

    // ─── Factor 1: Salinity ──────────────────────────────────────────────
    const salinity = sensorData?.salinity || 0;
    const stage = String(sensorData?.crop_stage || "").toUpperCase();
    const profile = CROP_STAGE_PROFILES[stage] || DEFAULT_STAGE_PROFILE;
    const salinityThreshold = profile.salinityMaxSafe;

    if (salinity > salinityThreshold) {
        factors.push({
            name: "🧂 Độ mặn",
            value: `${salinity} ppt`,
            threshold: `< ${salinityThreshold} ppt`,
            status: "⚠️ CAO",
            reasoning: `Độ mặn hiện tại đang vượt ngưỡng an toàn cho giai đoạn ${sensorData?.crop_stage}. Cần đóng van để tránh cháy lá.`
        });
    } else {
        factors.push({
            name: "🧂 Độ mặn",
            value: `${salinity} ppt`,
            threshold: `< ${salinityThreshold} ppt`,
            status: "✅ AN TOÀN",
            reasoning: `Nước sông đang đủ ngọt, rất thích hợp để lấy nước vào ruộng.`
        });
    }

    // ─── Factor 2: Moisture ──────────────────────────────────────────────
    const moisture = sensorData?.moisture || 0;
    let moistureStatus = "✅ TỐT";
    let moistureReasoning = "Độ ẩm đất đang ở mức lý tưởng cho cây lúa.";

    if (moisture < 40) {
        moistureStatus = "🔴 KHÔ";
        moistureReasoning = "Đất đang quá khô, lúa cần được tiếp nước ngay.";
    } else if (moisture > 80) {
        moistureStatus = "🔵 QUÁ ƯỚT";
        moistureReasoning = "Đất đang quá sũng nước, cần hạn chế tưới để tránh úng rễ.";
    }

    factors.push({
        name: "💧 Độ ẩm đất",
        value: `${moisture}%`,
        threshold: "40-80%",
        status: moistureStatus,
        reasoning: moistureReasoning
    });

    // ─── Factor 3: Weather ──────────────────────────────────────────────
    const rainfall = weatherData?.rainfall_24h || 0;
    const humidity = weatherData?.humidity || 0;
    const temp = weatherData?.temperature || 0;

    let weatherAdvice = `${temp}°C, độ ẩm ${humidity}%`;
    let weatherStatus = "✅ BÌNH THƯỜNG";

    if (rainfall > 40) {
        weatherAdvice = `Mưa rất to (${rainfall}mm/24h)! ⚠️`;
        weatherStatus = "🔴 MƯA LỚN";
    } else if (humidity > 80) {
        weatherAdvice = `Lưu ý độ ẩm không khí cao (${humidity}%)`;
        weatherStatus = "⚠️ ẨM CAO";
    }

    factors.push({
        name: "☀️ Thời tiết",
        value: weatherAdvice,
        threshold: "< 40mm mưa, ẩm < 80%",
        status: weatherStatus,
        reasoning: `Nhiệt độ ${temp}°C, lượng mưa tích lũy ${rainfall}mm.`
    });

    // ─── Factor 4: Tide ──────────────────────────────────────────────
    const tideStatus = tideData?.tide_status || "FALLING";
    const tideConfidence = (tideData?.confidence_score * 100).toFixed(0);

    let tideAdvice = "Điều kiện thủy triều bình thường.";
    let tideWarning = "";

    if (tideStatus === "RISING" && salinity > 1.0) {
        tideAdvice = `⚠️ Triều dâng + mặn cao = Nguy cơ xâm nhập mặn rất lớn!`;
        tideWarning = "🔴 NGUY CẤP";
    } else if (tideStatus === "RISING") {
        tideAdvice = `Nước đang dâng (Độ tin cậy ${tideConfidence}%)`;
    }

    factors.push({
        name: "🌊 Thủy triều",
        value: `${tideStatus === 'RISING' ? 'ĐANG LÊN' : 'ĐANG XUỐNG'}`,
        threshold: "Ưu tiên lấy nước khi triều xuống",
        status: tideWarning || "✅ OK",
        reasoning: tideAdvice
    });

    // ─── Factor 5: Crop Stage ────────────────────────────────────────
    const cropStageAdvice = getStageSafetyAdvice(sensorData?.crop_stage);
    factors.push({
        name: "🌱 Giai đoạn lúa",
        value: sensorData?.crop_stage || "CHƯA XÁC ĐỊNH",
        threshold: cropStageAdvice.threshold,
        status: "ℹ️ THÔNG TIN",
        reasoning: cropStageAdvice.advice
    });

    // ─── Build Final Explanation ──────────────────────────────────────
    return {
        timestamp: toVietnamISOString(),
        decision: decision?.executed_state || "ĐANG QUAN SÁT",
        mainReason: decision?.reason || "Chưa có quyết định",
        factors,
        guidelines_applied: guidelines || [],
        summary: buildSummary(factors, decision)
    };
}

/**
 * Get salinity threshold based on crop stage
 */
function getSalinityThreshold(cropStage) {
    const key = String(cropStage || "").trim().toUpperCase();
    const profile = CROP_STAGE_PROFILES[key] || DEFAULT_STAGE_PROFILE;
    return profile.salinityMaxSafe;
}

/**
 * Get stage-specific safety advice
 */
function getStageSafetyAdvice(cropStage) {
    const advice = {
        "SEEDLING": {
            advice: "Giai đoạn nhạy cảm nhất. Cần bảo vệ khỏi mặn & đổ lũa",
            threshold: "< 1.5 ppt salinity"
        },
        "VEGETATIVE": {
            advice: "Giai đoạn phát triển. Cần nước đều & bảo vệ khỏi lũa lụt",
            threshold: "< 2.0 ppt salinity, 40-80% moisture"
        },
        "FLOWERING": {
            advice: "Giai đoạn quan trọng cho năng suất. Nước phải > 70% luôn",
            threshold: "< 2.0 ppt salinity, > 70% moisture"
        },
        "HARVEST": {
            advice: "Giai đoạn cuối. Cần làm khô ruộng chuẩn bị thu hoạch",
            threshold: "Tránh nước đọng"
        }
    };
    return advice[cropStage] || { advice: "Giai đoạn chưa xác định", threshold: "N/A" };
}

/**
 * Helper to convert technical terms to friendly Vietnamese
 */
function humanizeAction(text) {
    if (!text) return text;
    return text
        .replace(/\bNO_ACTION\b/g, "Duy trì trạng thái")
        .replace(/\bOPEN\b/g, "Mở van")
        .replace(/\bCLOSED\b/g, "Đóng van");
}

/**
 * Build a one-line summary.
 */
function buildSummary(factors, decision) {
    const riskFactors = factors
        .filter(f => f.status.includes("🔴") || f.status.includes("⚠️"))
        .map(f => f.name)
        .join(" + ");

    const stateDesc = decision?.executed_state === "OPEN" ? "MỞ VAN" : "ĐÓNG VAN";

    if (riskFactors) {
        return `⚠️ Phát hiện rủi ro: ${riskFactors} -> Quyết định: ${stateDesc}`;
    }

    return `✅ Các chỉ số ổn định -> Trạng thái van: ${stateDesc}`;
}

/**
 * Format for Dashboard display
 */
function formatDecisionDisplay(sensorData, weatherData, tideData, guidelines, decision, aiStatus) {
    return {
        // ─── Sensor Metrics ──────────────────────────────
        sensorMetrics: {
            salinity: {
                value: sensorData?.salinity || 0,
                unit: "ppt",
                label: "Độ mặn nước sông",
                threshold: getSalinityThreshold(sensorData?.crop_stage),
                status: (sensorData?.salinity || 0) > getSalinityThreshold(sensorData?.crop_stage) ? "CAO" : "ỔN ĐỊNH"
            },
            moisture: {
                value: sensorData?.moisture || 0,
                unit: "%",
                label: "Độ ẩm đất",
                threshold: "40-80%",
                status: getMoistureStatus(sensorData?.moisture || 0)
            },
            water_level: {
                value: sensorData?.river_water_level || 0,
                unit: "m",
                label: "Mực nước sông"
            },
            crop_stage: {
                value: sensorData?.crop_stage || "CHƯA XÁC ĐỊNH",
                label: "Giai đoạn lúa"
            }
        },

        // ─── Weather Metrics ────────────────────────────
        weatherMetrics: {
            temperature: {
                value: weatherData?.temperature || 0,
                unit: "°C",
                label: "Nhiệt độ"
            },
            humidity: {
                value: weatherData?.humidity || 0,
                unit: "%",
                label: "Độ ẩm không khí"
            },
            rainfall_24h: {
                value: weatherData?.rainfall_24h || 0,
                unit: "mm",
                label: "Lượng mưa (24h)",
                alert: (weatherData?.rainfall_24h || 0) > 40 ? "⚠️ MƯA LỚN" : null
            },
            source: weatherData?.source || "HỆ THỐNG"
        },

        // ─── Tide Info ──────────────────────────────────
        tideInfo: {
            status: tideData?.tide_status || "CHƯA CẬP NHẬT",
            confidence: ((tideData?.confidence_score || 0) * 100).toFixed(0) + "%",
            label: tideData?.tide_status === "RISING" ? "🌊 Triều đang lên" : "🌊 Triều đang xuống"
        },

        // ─── AI Decision ───────────────────────────────
        aiDecision: {
            valve_state: humanizeAction(decision?.executed_state) || "ĐANG QUAN SÁT",
            reason: humanizeAction(decision?.reason) || "Chưa có quyết định",
            source_ids: decision?.source_ids || [],
            is_processing: aiStatus?.is_processing || false,
            last_reasoning: humanizeAction(aiStatus?.last_reasoning) || "N/A"
        },

        // ─── Retrieved Guidelines ──────────────────────
        guidelines: {
            count: guidelines?.length || 0,
            ids: guidelines || [],
            info: "Bằng chứng kỹ thuật canh tác đã áp dụng"
        },

        // ─── Detailed Explanation ──────────────────────
        explanation: {
            ...buildDetailedExplanation(sensorData, weatherData, tideData, guidelines, decision),
            mainReason: humanizeAction(decision?.reason || "Chưa có quyết định"),
            decision: humanizeAction(decision?.executed_state || "ĐANG QUAN SÁT")
        }
    };
}

function getMoistureStatus(moisture) {
    if (moisture < 40) return "KHÔ ⚠️";
    if (moisture > 80) return "ÚNG ⚠️";
    return "TỐT ✅";
}

module.exports = {
    buildDetailedExplanation,
    formatDecisionDisplay,
    getSalinityThreshold,
    getStageSafetyAdvice
};
