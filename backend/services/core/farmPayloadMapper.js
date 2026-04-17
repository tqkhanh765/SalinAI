const CROP_STAGES = ["GERMINATION", "SEEDLING", "VEGETATIVE", "FLOWERING", "FRUITING", "HARVEST"];
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
    crop_stage: CROP_STAGES.includes(raw.crop_stage) ? raw.crop_stage : "VEGETATIVE",
  };
}

function normalizeNestedSensorPayload(body = {}) {
  // Optimized for flat Event-Driven Push Payload from ESP32

  const payload = {
    salinity: toNumber(body.salinity, 0),
    moisture: toNumber(body.moisture, 0),
    water_flow: toNumber(body.water_flow, 0),
    river_water_level: body.river_water_level != null ? toNumber(body.river_water_level, null) : null,
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
  const actuator = root.actuator || {};
  const actionLogs = normalizeActionLogs(root.action_logs, limit);

  return {
    sensorData: {
      salinity: toNumber(sensorData.salinity, 0),
      moisture: toNumber(sensorData.moisture, 0),
      water_flow: toNumber(sensorData.water_flow, 0),
      river_water_level: sensorData.river_water_level != null ? toNumber(sensorData.river_water_level, null) : null,
      temperature: sensorData.external_forecast?.temperature != null ? toNumber(sensorData.external_forecast.temperature) : null,
      humidity: sensorData.external_forecast?.humidity != null ? toNumber(sensorData.external_forecast.humidity) : null,
      rainfall_24h: sensorData.external_forecast?.rainfall_24h != null ? toNumber(sensorData.external_forecast.rainfall_24h) : null,
      tide_status: sensorData.external_forecast?.tide_status || null,
      timestamp: sensorData.timestamp || null,
    },
    actuator: normalizeActuatorSnapshot(actuator),
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
