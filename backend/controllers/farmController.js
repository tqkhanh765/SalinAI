const db = require("../config/firebase");
const { buildFarmStatePayload, normalizeNestedSensorPayload } = require("../services/core/farmPayloadMapper");
const { getLatestSensorHistory } = require("../services/core/farmHistoryService");
const { streamFarmState: streamFarmStateService } = require("../services/core/farmRealtimeStreamService");
const { ingestSensorPayload } = require("../services/core/farmSensorIngestionService");
const { setControlMode, overrideActuatorFields } = require("../services/core/farmActuatorService");
const { validateIngestPayload } = require("../services/core/farmIngestValidationService");
const { decideAiTrigger } = require("../services/core/farmAiTriggerService");
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
    const validation = validateIngestPayload(payload);
    if (!validation.ok) {
      console.warn(`[Ingest API] ❌ Sensor Error Rejected: ${validation.invalidFields.join(", ")}`);
      return res.status(400).json({
        error: "Sensor Error",
        details: "Payload contains default hardware values or error codes.",
        invalidFields: validation.invalidFields,
      });
    }

    // 3. Sync to Firebase (Dashboard Update)
    // We get the previous history point BEFORE ingesting the new one
    const history = await getLatestSensorHistory(1);
    const previousPoint = history.length > 0 ? history[0] : null;

    const enrichedPayload = await ingestSensorPayload(payload);

    // 4. AI Trigger Filter (Delta-based Invocation)
    const { shouldTriggerAI, triggerReason } = decideAiTrigger(enrichedPayload, previousPoint);

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
    if (error.status) {
      return res.status(error.status).json(error.payload || { error: error.message });
    }
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
