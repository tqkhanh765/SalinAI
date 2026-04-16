const db = require("../../config/firebase");
const { fetchWeatherData } = require("../external/weatherService");
const { getTideData } = require("../external/tideService");
const { persistSensorHistoryPoint } = require("./farmHistoryService");

async function ingestSensorPayload(payload) {
  const weatherData = await fetchWeatherData();
  const tideData = await getTideData(payload.river_water_level, weatherData);

  if (weatherData.source !== "OPEN_METEO") {
    const err = new Error("Weather data is not from live Open-Meteo source");
    err.status = 503;
    err.payload = {
      error: "External Data Unavailable",
      details: "Live weather source unavailable. Please retry shortly.",
      source: weatherData.source || "UNKNOWN",
    };
    throw err;
  }

  if (!tideData || !tideData.tide_status) {
    const err = new Error("Tide data unavailable");
    err.status = 503;
    err.payload = {
      error: "External Data Unavailable",
      details: "Unable to derive tide data from live inputs.",
    };
    throw err;
  }

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
