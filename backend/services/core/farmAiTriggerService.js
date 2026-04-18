const db = require("../../config/firebase");

const DEFAULT_THRESHOLDS = {
  salinityDelta: 0.1,
  moistureDelta: 1,
  extremeWeatherCode: 95,
  extremeRainfall24h: 10,
};

async function decideAiTrigger(enrichedPayload, previousPoint, thresholds = DEFAULT_THRESHOLDS) {
  if (!previousPoint) {
    return {
      shouldTriggerAI: true,
      triggerReason: "Initial data point received.",
    };
  }

  // 1. Fetch AI's own suggested thresholds from the last decision
  let aiThresholds = null;
  try {
    const aiStatusSnap = await db.ref("SalinAI/ai_status/thresholds").once("value");
    aiThresholds = aiStatusSnap.val();
  } catch (err) {
    console.warn("[Trigger Service] Could not fetch AI thresholds, using defaults.");
  }

  // Map AI suggested names to internal threshold names
  const activeSalDelta = aiThresholds?.salinity_delta ?? thresholds.salinityDelta;
  const activeMoisDelta = aiThresholds?.moisture_delta ?? thresholds.moistureDelta;
  const recoverySal = aiThresholds?.recovery_salinity;
  const urgentMois = aiThresholds?.urgent_moisture;

  const currentSal = enrichedPayload.salinity || 0;
  const currentMois = enrichedPayload.moisture || 0;
  const prevSal = previousPoint.salinity || 0;
  const prevMois = previousPoint.moisture || 0;

  const salDelta = Math.abs(currentSal - prevSal);
  const moisDelta = Math.abs(currentMois - prevMois);

  // 2. RECOVERY TRIGGER: If water is now sweet enough based on AI's own recovery threshold
  if (recoverySal !== undefined && currentSal < recoverySal) {
    return {
      shouldTriggerAI: true,
      triggerReason: `Recovery detected: Salinity (${currentSal}) dropped below AI's target (${recoverySal}).`,
    };
  }

  // 3. URGENCY TRIGGER: If soil is too dry based on AI's urgency threshold
  if (urgentMois !== undefined && currentMois < urgentMois) {
    return {
      shouldTriggerAI: true,
      triggerReason: `Urgent moisture drop: Moisture (${currentMois}%) is below AI's safety limit (${urgentMois}%).`,
    };
  }

  // 4. CHANGE TRIGGER: Traditional delta checks (using AI-suggested deltas if available)
  if (salDelta > activeSalDelta) {
    return {
      shouldTriggerAI: true,
      triggerReason: `Salinity changed significantly (Delta: ${salDelta.toFixed(2)} vs Threshold: ${activeSalDelta}).`,
    };
  }

  if (moisDelta > activeMoisDelta) {
    return {
      shouldTriggerAI: true,
      triggerReason: `Moisture changed significantly (Delta: ${moisDelta.toFixed(1)} vs Threshold: ${activeMoisDelta}).`,
    };
  }

  // 5. Weather fallback
  const weatherCode = enrichedPayload.external_forecast?.weather_code;
  const rainfall24h = enrichedPayload.external_forecast?.rainfall_24h || 0;
  const previousWeatherCode = previousPoint.external_forecast?.weather_code;

  if (weatherCode >= thresholds.extremeWeatherCode && weatherCode !== previousWeatherCode) {
    return {
      shouldTriggerAI: true,
      triggerReason: "Extreme weather condition detected.",
    };
  }

  return {
    shouldTriggerAI: false,
    triggerReason: "",
  };
}

module.exports = {
  DEFAULT_THRESHOLDS,
  decideAiTrigger,
};
