const express = require("express");
const router = express.Router();

const db = require("../config/firebase");

const CROP_STAGES = ["SEEDLING", "VEGETATIVE", "FLOWERING", "FRUITING", "HARVEST"];
const CONTROL_MODES = ["AUTO", "MANUAL"];
const VALVE_STATES = ["OPEN", "CLOSED"];

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function buildFarmStatePayload(root, limit = 20) {
  const sensorData = root.sensor_data || {};
  const actuator = root.actuator || {};
  const aiStatus = root.ai_status || {};
  const actionLogs = normalizeActionLogs(root.action_logs, limit);

  return {
    sensorData: {
      salinity: toNumber(sensorData.salinity, 0),
      moisture: toNumber(sensorData.moisture, 0),
      temperature: sensorData.temperature != null ? toNumber(sensorData.temperature) : null,
      humidity: sensorData.humidity != null ? toNumber(sensorData.humidity) : null,
      ph: sensorData.ph != null ? toNumber(sensorData.ph) : null,
      weather: sensorData.weather || null,
      crop_stage: sensorData.crop_stage || "VEGETATIVE",
      timestamp: sensorData.timestamp || null,
    },
    actuator: {
      valve_state: VALVE_STATES.includes(actuator.valve_state) ? actuator.valve_state : "CLOSED",
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
    fetchedAt: new Date().toISOString(),
  };
}

router.get("/api/farm-state", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.logLimit || 20), 1), 100);
    const snapshot = await db.ref("/").once("value");
    const root = snapshot.val() || {};

    res.status(200).json(buildFarmStatePayload(root, limit));
  } catch (error) {
    console.error("[Farm API] Failed to read farm state:", error.message);
    res.status(500).json({ error: "Failed to read farm state", details: error.message });
  }
});

router.get("/api/farm-stream", (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.logLimit || 20), 1), 100);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (res.flushHeaders) {
    res.flushHeaders();
  }

  const rootRef = db.ref("/");

  const send = (eventName, payload) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const onRootValue = (snapshot) => {
    const root = snapshot.val() || {};
    send("farm_state", buildFarmStatePayload(root, limit));
  };

  const onRootError = (error) => {
    send("error", { error: "Stream listener failed", details: error.message });
  };

  rootRef.on("value", onRootValue, onRootError);

  const heartbeat = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    rootRef.off("value", onRootValue);
    res.end();
  });
});

router.post("/api/sensor-data", async (req, res) => {
  try {
    const { salinity, moisture, crop_stage, weather, temperature, humidity, ph } = req.body || {};

    const stage = String(crop_stage || "VEGETATIVE").toUpperCase();
    if (!CROP_STAGES.includes(stage)) {
      return res.status(400).json({
        error: "Invalid crop_stage",
        allowed: CROP_STAGES,
      });
    }

    const payload = {
      salinity: toNumber(salinity, 0),
      moisture: toNumber(moisture, 0),
      crop_stage: stage,
      weather: weather || null,
      timestamp: new Date().toISOString(),
    };

    if (temperature != null) payload.temperature = toNumber(temperature, null);
    if (humidity != null) payload.humidity = toNumber(humidity, null);
    if (ph != null) payload.ph = toNumber(ph, null);

    await db.ref("sensor_data").set(payload);

    res.status(200).json({
      status: "OK",
      updated: payload,
    });
  } catch (error) {
    console.error("[Farm API] Failed to write sensor_data:", error.message);
    res.status(500).json({ error: "Failed to write sensor_data", details: error.message });
  }
});

router.patch("/api/control-mode", async (req, res) => {
  try {
    const mode = String(req.body?.control_mode || "").toUpperCase();
    if (!CONTROL_MODES.includes(mode)) {
      return res.status(400).json({
        error: "Invalid control_mode",
        allowed: CONTROL_MODES,
      });
    }

    await db.ref("actuator/control_mode").set(mode);

    res.status(200).json({
      status: "OK",
      updated: { control_mode: mode },
    });
  } catch (error) {
    console.error("[Farm API] Failed to update control mode:", error.message);
    res.status(500).json({ error: "Failed to update control mode", details: error.message });
  }
});

router.post("/api/override", async (req, res) => {
  try {
    const modeInput = req.body?.control_mode;
    const valveInput = req.body?.valve_state;

    const updates = {};

    if (modeInput != null) {
      const mode = String(modeInput).toUpperCase();
      if (!CONTROL_MODES.includes(mode)) {
        return res.status(400).json({ error: "Invalid control_mode", allowed: CONTROL_MODES });
      }
      updates.control_mode = mode;
    }

    if (valveInput != null) {
      const valve = String(valveInput).toUpperCase();
      if (!VALVE_STATES.includes(valve)) {
        return res.status(400).json({ error: "Invalid valve_state", allowed: VALVE_STATES });
      }
      updates.valve_state = valve;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    await db.ref("actuator").update(updates);

    if (updates.valve_state) {
      await db.ref("action_logs").push({
        timestamp: new Date().toISOString(),
        actor: "USER",
        action: updates.valve_state,
        reason: "Manual override from frontend dashboard",
      });
    }

    res.status(200).json({
      status: "OK",
      updated: updates,
    });
  } catch (error) {
    console.error("[Farm API] Failed to override actuator:", error.message);
    res.status(500).json({ error: "Failed to override actuator", details: error.message });
  }
});

module.exports = router;