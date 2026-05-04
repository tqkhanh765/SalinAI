/**
 * SENSOR PAYLOAD MAPPER
 * 
 * Tác dụng: Chuẩn hóa dữ liệu thô từ cảm biến thành định dạng chung mà Dashboard
 * và AI có thể hiểu được. Đảm bảo tính nhất quán về giai đoạn cây trồng.
 */
const { CROP_STAGES } = require("../../config/crops");
const CONTROL_MODES = ["AUTO", "MANUAL"];
const VALVE_STATES = ["OPEN", "CLOSED"];

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeActuatorSnapshot(raw = {}) {
  return {
    valve_state: VALVE_STATES.includes(raw.valve_state) ? raw.valve_state : "CLOSED",
    pump_state: String(raw.pump_state || "OFF").toUpperCase() === "ON" ? "ON" : "OFF",
    control_mode: CONTROL_MODES.includes(raw.control_mode) ? raw.control_mode : "AUTO",
  };
}

function normalizeNestedSensorPayload(body = {}) {
  // Optimized for flat Event-Driven Push Payload from ESP32
  const cropStage = String(body.crop_stage || "VEGETATIVE").toUpperCase();

  if (!CROP_STAGES.includes(cropStage)) {
    return { error: { error: "Invalid crop_stage", allowed: CROP_STAGES } };
  }

  const payload = {
    salinity: toNumber(body.salinity, 0),
    moisture: toNumber(body.moisture, 0),
    ph: body.ph != null ? toNumber(body.ph, null) : null,
    river_water_level: body.river_water_level != null ? toNumber(body.river_water_level, null) : null,
    crop_stage: cropStage,
    timestamp: new Date().toISOString(),
    external_forecast: {
      tide_status: body.tide_status || null,
      temperature: body.temperature != null ? toNumber(body.temperature, null) : null,
    },
    actuator: normalizeActuatorSnapshot({ valve_state: body.valve_state, pump_state: body.pump_state }),
  };

  return { payload };
}

function normalizeActionLogs(rawLogs, limit = 20) {
  return Object.entries(rawLogs || {})
    .map(([id, item]) => ({ id, ...(item || {}) }))
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
    .slice(0, limit);
}

function buildFarmStatePayload(root, limit = 20, sensorHistory = []) {
  const sensorData = root.sensor_data || {};
  const enrichmentData = root.sensor_enrichment || {};
  const actuator = root.actuator || {};
  const aiStatus = root.ai_status || {};
  const actionLogs = normalizeActionLogs(root.action_logs, limit);

  // Deep merge sensor and enrichment for the dashboard
  const weatherContext = enrichmentData.external_forecast || sensorData.external_forecast || {};

  return {
    sensorData: {
      salinity: toNumber(sensorData.salinity, 0),
      moisture: toNumber(sensorData.moisture, 0),
      ph: sensorData.ph != null ? toNumber(sensorData.ph, null) : null,
      river_water_level: sensorData.river_water_level != null ? toNumber(sensorData.river_water_level, null) : null,
      temperature: weatherContext.temperature != null ? toNumber(weatherContext.temperature) : null,
      humidity: weatherContext.humidity != null ? toNumber(weatherContext.humidity) : null,
      rainfall_24h: weatherContext.rainfall_24h != null ? toNumber(weatherContext.rainfall_24h) : null,
      weather_code: weatherContext.weather_code != null ? toNumber(weatherContext.weather_code, null) : null,
      weather: weatherContext.weather || null,
      tide_status: weatherContext.tide_status || null,
      crop_stage: sensorData.crop_stage || "VEGETATIVE",
      timestamp: sensorData.timestamp || null,
    },
    actuator: normalizeActuatorSnapshot(actuator),

    aiStatus,
    actionLogs,
    sensorHistory,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = {
  CROP_STAGES,
  CONTROL_MODES,
  VALVE_STATES,
  toNumber,
  normalizeNestedSensorPayload,
  buildFarmStatePayload,
};
