const db = require("../config/firebase");
const { buildFarmStatePayload, normalizeNestedSensorPayload } = require("../services/farmPayloadMapper");
const { getLatestSensorHistory } = require("../services/farmHistoryService");
const { streamFarmState: streamFarmStateService } = require("../services/farmRealtimeStreamService");
const { ingestSensorPayload } = require("../services/farmSensorIngestionService");
const { setControlMode, overrideActuatorFields } = require("../services/farmActuatorService");

async function buildStatePayload(root, limit) {
  const sensorHistory = await getLatestSensorHistory(30);
  return buildFarmStatePayload(root, limit, sensorHistory);
}

async function getFarmState(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.logLimit || 20), 1), 100);
    const snapshot = await db.ref("/").once("value");
    const root = snapshot.val() || {};

    res.status(200).json(await buildStatePayload(root, limit));
  } catch (error) {
    console.error("[Farm API] Failed to read farm state:", error.message);
    res.status(500).json({ error: "Failed to read farm state", details: error.message });
  }
}

function streamFarmState(req, res) {
  return streamFarmStateService(req, res, {
    rootRef: db.ref("/"),
    buildPayload: buildStatePayload,
  });
}

async function submitSensorData(req, res) {
  try {
    const normalized = normalizeNestedSensorPayload(req.body || {});

    if (normalized.error) {
      return res.status(400).json(normalized.error);
    }

    const updatedPayload = await ingestSensorPayload(normalized.payload);

    res.status(200).json({
      status: "OK",
      updated: updatedPayload,
    });
  } catch (error) {
    console.error("[Farm API] Failed to write sensor_data:", error.message);
    res.status(500).json({ error: "Failed to write sensor_data", details: error.message });
  }
}

async function updateControlMode(req, res) {
  try {
    const updated = await setControlMode(req.body?.control_mode);

    res.status(200).json({
      status: "OK",
      updated,
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json(error.payload || { error: error.message });
    }
    console.error("[Farm API] Failed to update control mode:", error.message);
    res.status(500).json({ error: "Failed to update control mode", details: error.message });
  }
}

async function overrideActuator(req, res) {
  try {
    const updated = await overrideActuatorFields({
      control_mode: req.body?.control_mode,
      valve_state: req.body?.valve_state,
    });

    res.status(200).json({
      status: "OK",
      updated,
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json(error.payload || { error: error.message });
    }
    console.error("[Farm API] Failed to override actuator:", error.message);
    res.status(500).json({ error: "Failed to override actuator", details: error.message });
  }
}

module.exports = {
  getFarmState,
  streamFarmState,
  submitSensorData,
  updateControlMode,
  overrideActuator,
};