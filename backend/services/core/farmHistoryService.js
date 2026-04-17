/**
 * Sensor history service.
 * Reads and writes compact historical sensor points used for trend analysis and AI decision context.
 */
const { getDb } = require("../../config/mongodb");
const { toNumber } = require("./farmPayloadMapper");

const SENSOR_HISTORY_COLLECTION = "sensor_history";

async function getLatestSensorHistory(limit = 30) {
  try {
    const mongo = getDb();
    if (!mongo) return [];

    const docs = await mongo
      .collection(SENSOR_HISTORY_COLLECTION)
      .find({}, { projection: { _id: 0, timestamp: 1, salinity: 1, moisture: 1, river_water_level: 1, crop_stage: 1, weather: 1, external_forecast: 1 } })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    return docs.reverse();
  } catch (error) {
    console.error("[Farm API] Failed to load sensor history from MongoDB:", error.message);
    return [];
  }
}

async function persistSensorHistoryPoint(payload) {
  try {
    const mongo = getDb();
    if (!mongo) return;

    await mongo.collection(SENSOR_HISTORY_COLLECTION).insertOne({
      salinity: toNumber(payload.salinity, 0),
      moisture: toNumber(payload.moisture, 0),
      water_flow: toNumber(payload.water_flow, 0),
      timestamp: payload.timestamp || new Date().toISOString(),
      crop_stage: payload.crop_stage || "VEGETATIVE",
      river_water_level: payload.river_water_level != null ? toNumber(payload.river_water_level, null) : null,
      weather: payload.weather || null,
      external_forecast: payload.external_forecast || {},
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("[Farm API] Failed to persist sensor history to MongoDB:", error.message);
  }
}

module.exports = {
  getLatestSensorHistory,
  persistSensorHistoryPoint,
};
