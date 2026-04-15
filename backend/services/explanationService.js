/**
 * Explanation Service - Convert technical agent decisions to human-friendly language
 * 
 * Purpose: Make agent reasoning understandable to farmers + show all metrics
 */

/**
 * Build human-friendly explanation of agent decision
 */
function buildDetailedExplanation(sensorData, weatherData, tideData, guidelines, decision) {
    const factors = [];

    // ─── Factor 1: Salinity ──────────────────────────────────────────────
    const salinity = sensorData?.salinity || 0;
    const salinityThreshold = getSalinityThreshold(sensorData?.crop_stage);
    
    if (salinity > salinityThreshold) {
        factors.push({
            name: "🧂 Salinity (Mặn)",
            value: `${salinity} ppt`,
            threshold: `< ${salinityThreshold} ppt`,
            status: "⚠️ HIGH",
            reasoning: `Nước mặn quá cao so với cây ${sensorData?.crop_stage}. Rủi ro ảnh hưởng vào năng suất.`
        });
    } else {
        factors.push({
            name: "🧂 Salinity (Mặn)",
            value: `${salinity} ppt`,
            threshold: `< ${salinityThreshold} ppt`,
            status: "✅ SAFE",
            reasoning: `Độ mặn an toàn cho giai đoạn ${sensorData?.crop_stage}`
        });
    }

    // ─── Factor 2: Moisture ──────────────────────────────────────────────
    const moisture = sensorData?.moisture || 0;
    let moistureStatus = "✅ GOOD";
    let moistureReasoning = "Độ ẩm đất bình thường";
    
    if (moisture < 40) {
        moistureStatus = "🔴 DRY";
        moistureReasoning = "Đất quá khô, cây cần nước!";
    } else if (moisture > 80) {
        moistureStatus = "🔵 WET";
        moistureReasoning = "Đất quá ẩm, dễ gây bệnh nấm";
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
    let weatherStatus = "✅ NORMAL";

    if (rainfall > 40) {
        weatherAdvice = `Mưa lớn ${rainfall}mm trong 24h! ⚠️`;
        weatherStatus = "🔴 HEAVY RAIN";
    } else if (humidity > 80) {
        weatherAdvice = `Độ ẩm không khí rất cao ${humidity}% → nguy hiểm bệnh nấm`;
        weatherStatus = "⚠️ HIGH HUMIDITY";
    }

    factors.push({
        name: "☀️ Thời tiết",
        value: weatherAdvice,
        threshold: "< 40mm rain, humidity < 80%",
        status: weatherStatus,
        reasoning: `${temp}°C, ${humidity}% humid, ${rainfall}mm rain/24h`
    });

    // ─── Factor 4: Tide ──────────────────────────────────────────────
    const tideStatus = tideData?.tide_status || "FALLING";
    const tideConfidence = (tideData?.confidence_score * 100).toFixed(0);

    let tideAdvice = "Thủy triều bình thường";
    let tideWarning = "";

    if (tideStatus === "RISING" && salinity > 1.0) {
        tideAdvice = `⚠️ Nước lên + mặn cao = nguy hiểm xâm nhập mặn!`;
        tideWarning = "CRITICAL";
    } else if (tideStatus === "RISING") {
        tideAdvice = `Nước sắp lên (${tideConfidence}% chắc chắn)`;
    }

    factors.push({
        name: "🌊 Thủy triều",
        value: `${tideStatus} (${tideConfidence}% confidence)`,
        threshold: "FALLING preferred when salinity > 1ppt",
        status: tideWarning ? "🔴 RISING" : "✅ OK",
        reasoning: tideAdvice
    });

    // ─── Factor 5: Crop Stage ────────────────────────────────────────
    const cropStageAdvice = getStageSafetyAdvice(sensorData?.crop_stage);
    factors.push({
        name: "🌱 Giai đoạn cây trồng",
        value: sensorData?.crop_stage || "UNKNOWN",
        threshold: cropStageAdvice.threshold,
        status: "ℹ️ INFO",
        reasoning: cropStageAdvice.advice
    });

    // ─── Build Final Explanation ──────────────────────────────────────
    return {
        timestamp: new Date().toISOString(),
        decision: decision?.executed_state || "UNKNOWN",
        mainReason: decision?.reason || "No decision yet",
        factors,
        guidelines_applied: guidelines || [],
        summary: buildSummary(factors, decision)
    };
}

/**
 * Get salinity threshold based on crop stage
 */
function getSalinityThreshold(cropStage) {
    const thresholds = {
        "SEEDLING": 1.5,
        "VEGETATIVE": 2.0,
        "FLOWERING": 2.0,
        "FRUITING": 2.5,
        "HARVEST": 3.0
    };
    return thresholds[cropStage] || 2.0;
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
    return advice[cropStage] || { advice: "Unknown stage", threshold: "N/A" };
}

/**
 * Build one-line summary in Vietnamese
 */
function buildSummary(factors, decision) {
    const riskFactors = factors
        .filter(f => f.status.includes("🔴") || f.status.includes("⚠️"))
        .map(f => f.name)
        .join(" + ");

    if (riskFactors) {
        return `⚠️ Phát hiện rủi ro: ${riskFactors} → Quyết định: ${decision?.executed_state}`;
    }

    return `✅ Điều kiện bình thường → Van: ${decision?.executed_state === "OPEN" ? "MỞ" : "ĐÓNG"}`;
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
                label: "Độ mặn sông",
                threshold: getSalinityThreshold(sensorData?.crop_stage),
                status: (sensorData?.salinity || 0) > getSalinityThreshold(sensorData?.crop_stage) ? "HIGH" : "OK"
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
                value: sensorData?.crop_stage || "UNKNOWN",
                label: "Giai đoạn cây"
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
                label: "Mưa 24h",
                alert: (weatherData?.rainfall_24h || 0) > 40 ? "⚠️ HEAVY RAIN" : null
            },
            source: weatherData?.source || "UNKNOWN"
        },

        // ─── Tide Info ──────────────────────────────────
        tideInfo: {
            status: tideData?.tide_status || "UNKNOWN",
            confidence: ((tideData?.confidence_score || 0) * 100).toFixed(0) + "%",
            label: tideData?.tide_status === "RISING" ? "🌊 Nước lên" : "🌊 Nước xuống"
        },

        // ─── AI Decision ───────────────────────────────
        aiDecision: {
            valve_state: decision?.executed_state || "NO_ACTION",
            reason: decision?.reason || "Chưa có quyết định",
            source_ids: decision?.source_ids || [],
            is_processing: aiStatus?.is_processing || false,
            last_reasoning: aiStatus?.last_reasoning || "N/A"
        },

        // ─── Retrieved Guidelines ──────────────────────
        guidelines: {
            count: guidelines?.length || 0,
            ids: guidelines || [],
            info: "Hướng dẫn nông nghiệp được áp dụng"
        },

        // ─── Detailed Explanation ──────────────────────
        explanation: buildDetailedExplanation(sensorData, weatherData, tideData, guidelines, decision)
    };
}

function getMoistureStatus(moisture) {
    if (moisture < 40) return "DRY ⚠️";
    if (moisture > 80) return "WET ⚠️";
    return "GOOD ✅";
}

module.exports = {
    buildDetailedExplanation,
    formatDecisionDisplay,
    getSalinityThreshold,
    getStageSafetyAdvice
};
