const db = require("../../config/firebase");
const { fetchWeatherData } = require("../external/weatherService");
const { getTideData } = require("../external/tideService");
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



  return enrichedPayload;
}

module.exports = {
  ingestSensorPayload,
};
