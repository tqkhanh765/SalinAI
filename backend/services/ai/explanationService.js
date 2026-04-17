/**
 * Decision explanation service.
 * Converts technical AI output into dashboard-friendly summaries and metric cards for users.
 */

/**
 * Build a user-friendly explanation of the final decision.
 */
function buildDetailedExplanation(sensorData, weatherData, tideData, guidelines, decision) {
    const factors = [];

    // ─── Factor 1: Salinity ──────────────────────────────────────────────
    const salinity = sensorData?.salinity || 0;
    const salinityThreshold = getSalinityThreshold(sensorData?.crop_stage);

    if (salinity > salinityThreshold) {
        factors.push({
            name: "🧂 Salinity",
            value: `${salinity} ppt`,
            threshold: `< ${salinityThreshold} ppt`,
            status: "⚠️ HIGH",
            reasoning: `Salinity is too high for crop stage ${sensorData?.crop_stage}. This may reduce yield.`
        });
    } else {
        factors.push({
            name: "🧂 Salinity",
            value: `${salinity} ppt`,
            threshold: `< ${salinityThreshold} ppt`,
            status: "✅ SAFE",
            reasoning: `Salinity is within a safe range for stage ${sensorData?.crop_stage}`
        });
    }

    // ─── Factor 2: Moisture ──────────────────────────────────────────────
    const moisture = sensorData?.moisture || 0;
    let moistureStatus = "✅ GOOD";
    let moistureReasoning = "Soil moisture is in a healthy range";

    if (moisture < 40) {
        moistureStatus = "🔴 DRY";
        moistureReasoning = "Soil is too dry; crops need water.";
    } else if (moisture > 80) {
        moistureStatus = "🔵 WET";
        moistureReasoning = "Soil is too wet; fungal risk is higher.";
    }

    factors.push({
        name: "💧 Soil Moisture",
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
        weatherAdvice = `Heavy rain ${rainfall}mm in 24h! ⚠️`;
        weatherStatus = "🔴 HEAVY RAIN";
    } else if (humidity > 80) {
        weatherAdvice = `Very high air humidity ${humidity}% -> fungal disease risk`;
        weatherStatus = "⚠️ HIGH HUMIDITY";
    }

    factors.push({
        name: "☀️ Weather",
        value: weatherAdvice,
        threshold: "< 40mm rain, humidity < 80%",
        status: weatherStatus,
        reasoning: `${temp}°C, ${humidity}% humid, ${rainfall}mm rain/24h`
    });

    // ─── Factor 4: Tide ──────────────────────────────────────────────
    const tideStatus = tideData?.tide_status || "FALLING";
    const tideConfidence = (tideData?.confidence_score * 100).toFixed(0);

    let tideAdvice = "Tide condition is normal";
    let tideWarning = "";

    if (tideStatus === "RISING" && salinity > 1.0) {
        tideAdvice = `⚠️ Rising tide + high salinity = elevated salinity intrusion risk!`;
        tideWarning = "CRITICAL";
    } else if (tideStatus === "RISING") {
        tideAdvice = `Tide is rising (${tideConfidence}% confidence)`;
    }

    factors.push({
        name: "🌊 Tide",
        value: `${tideStatus} (${tideConfidence}% confidence)`,
        threshold: "FALLING preferred when salinity > 1ppt",
        status: tideWarning ? "🔴 RISING" : "✅ OK",
        reasoning: tideAdvice
    });

    // ─── Factor 5: Crop Stage ────────────────────────────────────────
    const cropStageAdvice = getStageSafetyAdvice(sensorData?.crop_stage);
    factors.push({
        name: "🌱 Crop Stage",
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
 * Build a one-line summary.
 */
function buildSummary(factors, decision) {
    const riskFactors = factors
        .filter(f => f.status.includes("🔴") || f.status.includes("⚠️"))
        .map(f => f.name)
        .join(" + ");

    if (riskFactors) {
        return `⚠️ Risk detected: ${riskFactors} -> Decision: ${decision?.executed_state}`;
    }

    return `✅ Conditions are normal -> Valve: ${decision?.executed_state === "OPEN" ? "OPEN" : "CLOSED"}`;
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
                label: "River Salinity",
                threshold: getSalinityThreshold(sensorData?.crop_stage),
                status: (sensorData?.salinity || 0) > getSalinityThreshold(sensorData?.crop_stage) ? "HIGH" : "OK"
            },
            moisture: {
                value: sensorData?.moisture || 0,
                unit: "%",
                label: "Soil Moisture",
                threshold: "40-80%",
                status: getMoistureStatus(sensorData?.moisture || 0)
            },
            water_level: {
                value: sensorData?.river_water_level || 0,
                unit: "m",
                label: "River Water Level"
            },
            crop_stage: {
                value: sensorData?.crop_stage || "UNKNOWN",
                label: "Crop Stage"
            }
        },

        // ─── Weather Metrics ────────────────────────────
        weatherMetrics: {
            temperature: {
                value: weatherData?.temperature || 0,
                unit: "°C",
                label: "Temperature"
            },
            humidity: {
                value: weatherData?.humidity || 0,
                unit: "%",
                label: "Air Humidity"
            },
            rainfall_24h: {
                value: weatherData?.rainfall_24h || 0,
                unit: "mm",
                label: "Rainfall (24h)",
                alert: (weatherData?.rainfall_24h || 0) > 40 ? "⚠️ HEAVY RAIN" : null
            },
            source: weatherData?.source || "UNKNOWN"
        },

        // ─── Tide Info ──────────────────────────────────
        tideInfo: {
            status: tideData?.tide_status || "UNKNOWN",
            confidence: ((tideData?.confidence_score || 0) * 100).toFixed(0) + "%",
            label: tideData?.tide_status === "RISING" ? "🌊 Rising Tide" : "🌊 Falling Tide"
        },

        // ─── AI Decision ───────────────────────────────
        aiDecision: {
            valve_state: decision?.executed_state || "NO_ACTION",
            reason: decision?.reason || "No decision yet",
            source_ids: decision?.source_ids || [],
            is_processing: aiStatus?.is_processing || false,
            last_reasoning: aiStatus?.last_reasoning || "N/A"
        },

        // ─── Retrieved Guidelines ──────────────────────
        guidelines: {
            count: guidelines?.length || 0,
            ids: guidelines || [],
            info: "Applied agricultural guideline evidence"
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
