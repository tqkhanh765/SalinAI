const CROP_STAGES = ["SEEDLING", "VEGETATIVE", "FLOWERING", "FRUITING", "HARVEST"];
const CONTROL_MODES = ["AUTO", "MANUAL"];
const VALVE_STATES = ["OPEN", "CLOSED"];

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeActuatorSnapshot(rawActuator = {}) {
  return {
    valve_state: VALVE_STATES.includes(rawActuator.valve_state) ? rawActuator.valve_state : "CLOSED",
    pump_state: String(rawActuator.pump_state || "OFF").toUpperCase() === "ON" ? "ON" : "OFF",
    control_mode: CONTROL_MODES.includes(rawActuator.control_mode) ? rawActuator.control_mode : "AUTO",
  };
}

function normalizeNestedSensorPayload(body = {}) {
  const sensorTelemetry = body.sensor_telemetry || {};
  const actuatorInput = body.actuator || {};
  const stationMetadata = body.station_metadata || {};
  const externalForecast = body.external_forecast || {};
  const rawActionLogs = body.action_logs || {};

  const cropStage = String(
    stationMetadata.growth_stage || body.crop_stage || sensorTelemetry.crop_stage || "VEGETATIVE"
  ).toUpperCase();

  if (!CROP_STAGES.includes(cropStage)) {
    return {
      error: {
        error: "Invalid crop_stage",
        allowed: CROP_STAGES,
      },
    };
  }

  const salinity = toNumber(sensorTelemetry.river_salinity ?? body.salinity, 0);
  const moisture = toNumber(sensorTelemetry.soil_moisture ?? body.moisture, 0);
  const riverWaterLevelInput = sensorTelemetry.river_water_level ?? body.river_water_level;

  const payload = {
    salinity,
    moisture,
    river_salinity: salinity,
    soil_moisture: moisture,
    river_water_level: riverWaterLevelInput != null ? toNumber(riverWaterLevelInput, null) : null,
    crop_stage: cropStage,
    weather: externalForecast.weather || body.weather || null,
    timestamp: new Date().toISOString(),
    station_metadata: {
      field_elevation:
        stationMetadata.field_elevation != null ? toNumber(stationMetadata.field_elevation, null) : null,
      crop_type: stationMetadata.crop_type || body.crop_type || null,
      growth_stage: cropStage,
    },
    external_forecast: {
      tide_status: externalForecast.tide_status || body.tide_status || null,
      rainfall_24h:
        externalForecast.rainfall_24h != null ? toNumber(externalForecast.rainfall_24h, null) : null,
      temperature: externalForecast.temperature != null ? toNumber(externalForecast.temperature, null) : null,
    },
    actuator: normalizeActuatorSnapshot(actuatorInput),
  };

  if (rawActionLogs && typeof rawActionLogs === "object" && Object.keys(rawActionLogs).length > 0) {
    payload.action_logs = rawActionLogs;
  }

  return { payload };
}

function normalizeActionLogs(rawLogs, limit = 20) {
  const entries = Object.entries(rawLogs || {})
    .map(([id, item]) => ({ id, ...(item || {}) }))
    .sort((a, b) => {
      const at = new Date(a.timestamp || 0).getTime();
      const bt = new Date(b.timestamp || 0).getTime();
      return bt - at;
    });

  return entries.slice(0, limit);
}

function buildFarmStatePayload(root, limit = 20, sensorHistory = []) {
  const sensorData = root.sensor_data || {};
  const actuator = root.actuator || {};
  const aiStatus = root.ai_status || {};
  const actionLogs = normalizeActionLogs(root.action_logs, limit);

  return {
    sensorData: {
      salinity: toNumber(sensorData.salinity, 0),
      moisture: toNumber(sensorData.moisture, 0),
      river_salinity:
        sensorData.river_salinity != null ? toNumber(sensorData.river_salinity, 0) : toNumber(sensorData.salinity, 0),
      soil_moisture:
        sensorData.soil_moisture != null ? toNumber(sensorData.soil_moisture, 0) : toNumber(sensorData.moisture, 0),
      river_water_level: sensorData.river_water_level != null ? toNumber(sensorData.river_water_level, null) : null,
      temperature: sensorData.temperature != null ? toNumber(sensorData.temperature) : null,
      humidity: sensorData.humidity != null ? toNumber(sensorData.humidity) : null,
      ph: sensorData.ph != null ? toNumber(sensorData.ph) : null,
      weather: sensorData.weather || null,
      crop_stage: sensorData.crop_stage || "VEGETATIVE",
      timestamp: sensorData.timestamp || null,
      station_metadata: sensorData.station_metadata || {
        field_elevation: sensorData.field_elevation != null ? toNumber(sensorData.field_elevation, null) : null,
        crop_type: sensorData.crop_type || null,
        growth_stage: sensorData.crop_stage || "VEGETATIVE",
      },
      external_forecast: sensorData.external_forecast || {
        tide_status: sensorData.tide_status || null,
        rainfall_24h: sensorData.rainfall_24h != null ? toNumber(sensorData.rainfall_24h, null) : null,
        temperature: sensorData.forecast_temperature != null ? toNumber(sensorData.forecast_temperature, null) : null,
      },
    },
    actuator: {
      valve_state: VALVE_STATES.includes(actuator.valve_state) ? actuator.valve_state : "CLOSED",
      pump_state: String(actuator.pump_state || "OFF").toUpperCase() === "ON" ? "ON" : "OFF",
      control_mode: CONTROL_MODES.includes(actuator.control_mode) ? actuator.control_mode : "AUTO",
    },
    aiStatus: {
      is_processing: Boolean(aiStatus.is_processing),
      last_reasoning: aiStatus.last_reasoning || "",
      alert_sent: Boolean(aiStatus.alert_sent),
      last_retrieval_hit_count: toNumber(aiStatus.last_retrieval_hit_count, 0),
      last_retrieval_source_ids: Array.isArray(aiStatus.last_retrieval_source_ids)
        ? aiStatus.last_retrieval_source_ids
        : [],
    },
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
