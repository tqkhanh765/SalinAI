const db = require("../../config/firebase");
const { fetchWeatherData } = require("../external/weatherService");
const { getTideData } = require("../external/tideService");
const { persistSensorHistoryPoint } = require("./farmHistoryService");

async function ingestSensorPayload(payload) {
  const weatherData = await fetchWeatherData();
  const tideData = await getTideData(payload.river_water_level, weatherData);

  const enrichedPayload = {
    ...payload,
    external_forecast: { ...weatherData, ...tideData }
  };

  await db.ref("SalinAI/sensor_data").set(payload);
  await db.ref("SalinAI/sensor_enrichment").update({
    external_forecast: enrichedPayload.external_forecast
  });

  return enrichedPayload;
}

module.exports = { ingestSensorPayload };
