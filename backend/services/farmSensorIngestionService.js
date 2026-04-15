const db = require("../config/firebase");
const { fetchWeatherData } = require("./weatherService");
const { getTideData } = require("./tideService");
const { persistSensorHistoryPoint } = require("./farmHistoryService");

async function ingestSensorPayload(payload) {
  const [weatherData, tideData] = await Promise.all([
    fetchWeatherData(),
    getTideData(payload.river_water_level, {}),
  ]);

  const enrichedPayload = {
    ...payload,
    external_forecast: {
      ...payload.external_forecast,
      ...weatherData,
      ...tideData,
    },
  };

  await db.ref("sensor_data").set(enrichedPayload);
  await persistSensorHistoryPoint(enrichedPayload);

  await db.ref("action_logs").push({
    timestamp: new Date().toISOString(),
    actor: "USER",
    action: "NO_ACTION",
    reason: `Sensor trigger submitted from IoT hardware. Salinity=${enrichedPayload.salinity}, Moisture=${enrichedPayload.moisture}, Stage=${enrichedPayload.crop_stage}`,
    sensor_snapshot: enrichedPayload,
  });

  return enrichedPayload;
}

module.exports = {
  ingestSensorPayload,
};
