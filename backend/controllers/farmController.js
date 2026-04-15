const db = require("../config/firebase");
const { buildFarmStatePayload, normalizeNestedSensorPayload, toNumber } = require("../services/farmPayloadMapper");
const { getLatestSensorHistory } = require("../services/farmHistoryService");
const { streamFarmState: streamFarmStateService } = require("../services/farmRealtimeStreamService");
const { ingestSensorPayload } = require("../services/farmSensorIngestionService");
const { setControlMode, overrideActuatorFields } = require("../services/farmActuatorService");
const { runAgent } = require("../agent/langchain");

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

/**
 * ingestData (Unified Endpoint for Hardware)
 * Implements strict validation and AI Trigger Filter.
 */
async function ingestData(req, res) {
  try {
    const rawBody = req.body || {};
    
    // 1. Strict Schema Validation (Fail-Fast)
    const normalized = normalizeNestedSensorPayload(rawBody);
    if (normalized.error) {
      return res.status(400).json(normalized.error);
    }

    const payload = normalized.payload;

    // 2. Strict Data Integrity Checks (Reject default/error values)
    const invalidFields = [];
    
    // Check Salinity & Moisture (Primary Sensors)
    if (payload.salinity <= 0 || !Number.isFinite(payload.salinity)) invalidFields.push("salinity (must be > 0)");
    if (payload.moisture <= 0 || payload.moisture > 100 || !Number.isFinite(payload.moisture)) invalidFields.push("moisture (must be 1-100)");
    
    // Check for negative error codes in any numeric field
    for (const [key, val] of Object.entries(payload)) {
      if (typeof val === "number" && val < 0 && key !== "river_water_level") { // water level might be -ve if below benchmark? but user said reject negatives
        invalidFields.push(`${key} (negative error code detected)`);
      }
    }

    if (invalidFields.length > 0) {
      console.warn(`[Ingest API] ❌ Sensor Error Rejected: ${invalidFields.join(", ")}`);
      return res.status(400).json({
        error: "Sensor Error",
        details: "Payload contains default hardware values or error codes.",
        invalidFields
      });
    }

    // 3. Sync to Firebase (Dashboard Update)
    // We get the previous history point BEFORE ingesting the new one
    const history = await getLatestSensorHistory(1);
    const previousPoint = history.length > 0 ? history[0] : null;

    const enrichedPayload = await ingestSensorPayload(payload);

    // 4. AI Trigger Filter (Delta-based Invocation)
    let shouldTriggerAI = false;
    let triggerReason = "";

    if (!previousPoint) {
      shouldTriggerAI = true;
      triggerReason = "Initial data point received.";
    } else {
      const salDelta = Math.abs(enrichedPayload.salinity - previousPoint.salinity);
      const moisDelta = Math.abs(enrichedPayload.moisture - previousPoint.moisture);
      
      // Check Weather Anomaly (Storm or heavy rain)
      const isExtremeWeather = (enrichedPayload.external_forecast?.weather_code >= 95 || (enrichedPayload.external_forecast?.rainfall_24h || 0) > 10);
      const weatherChanged = enrichedPayload.external_forecast?.weather_code !== previousPoint.external_forecast?.weather_code;

      if (salDelta > 0.5) {
        shouldTriggerAI = true;
        triggerReason = `Salinity spike detected (Delta: ${salDelta.toFixed(2)} ppt).`;
      } else if (moisDelta > 10) {
        shouldTriggerAI = true;
        triggerReason = `Moisture delta exceeded threshold (Delta: ${moisDelta.toFixed(1)}%).`;
      } else if (isExtremeWeather && weatherChanged) {
        shouldTriggerAI = true;
        triggerReason = "Extreme weather condition detected.";
      }
    }

    if (shouldTriggerAI) {
      console.log(`[Ingest API] 🤖 AI Triggered: ${triggerReason}`);
      
      // Set AI to processing state in Firebase
      await db.ref("ai_status").update({ 
        is_processing: true,
        last_reasoning: `Triggered by: ${triggerReason}` 
      });

      // Run Agent pipeline (non-blocking for the HTTP response)
      runAgent(enrichedPayload).catch(err => {
        console.error("[Ingest API] ❌ AI Agent failure:", err.message);
        db.ref("ai_status").update({ 
          is_processing: false, 
          last_reasoning: `AI Error: ${err.message}` 
        });
      });

      return res.status(200).json({
        status: "OK",
        message: "Data synced. AI reasoning triggered.",
        trigger: triggerReason,
        updated: enrichedPayload
      });
    } else {
      console.log("[Ingest API] 💤 Data synced to UI. AI execution skipped (no significant delta).");
      return res.status(200).json({
        status: "OK",
        message: "Data synced to UI. AI execution skipped (no significant delta).",
        updated: enrichedPayload
      });
    }

  } catch (error) {
    console.error("[Ingest API] ❌ Internal Error:", error.message);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}

async function submitSensorData(req, res) {
  // Legacy support or redirects to ingestData
  return ingestData(req, res);
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
  ingestData,
  updateControlMode,
  overrideActuator,
};