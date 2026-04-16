const DEFAULT_THRESHOLDS = {
  salinityDelta: 0.5,
  moistureDelta: 10,
  extremeWeatherCode: 95,
  extremeRainfall24h: 10,
};

function decideAiTrigger(enrichedPayload, previousPoint, thresholds = DEFAULT_THRESHOLDS) {
  if (!previousPoint) {
    return {
      shouldTriggerAI: true,
      triggerReason: "Initial data point received.",
    };
  }

  const salDelta = Math.abs((enrichedPayload.salinity || 0) - (previousPoint.salinity || 0));
  const moisDelta = Math.abs((enrichedPayload.moisture || 0) - (previousPoint.moisture || 0));

  const weatherCode = enrichedPayload.external_forecast?.weather_code;
  const rainfall24h = enrichedPayload.external_forecast?.rainfall_24h || 0;
  const previousWeatherCode = previousPoint.external_forecast?.weather_code;

  const isExtremeWeather = (
    weatherCode >= thresholds.extremeWeatherCode ||
    rainfall24h > thresholds.extremeRainfall24h
  );
  const weatherChanged = weatherCode !== previousWeatherCode;

  if (salDelta > thresholds.salinityDelta) {
    return {
      shouldTriggerAI: true,
      triggerReason: `Salinity spike detected (Delta: ${salDelta.toFixed(2)} ppt).`,
    };
  }

  if (moisDelta > thresholds.moistureDelta) {
    return {
      shouldTriggerAI: true,
      triggerReason: `Moisture delta exceeded threshold (Delta: ${moisDelta.toFixed(1)}%).`,
    };
  }

  if (isExtremeWeather && weatherChanged) {
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
