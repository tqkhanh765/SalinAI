/**
 * Farm API controller.
 * Validates incoming sensor updates, serves realtime snapshots, and exposes feedback/policy endpoints for the AI workflow.
 */
const db = require("../config/firebase");
const { buildFarmStatePayload, normalizeNestedSensorPayload } = require("../services/core/farmPayloadMapper");
const { getLatestSensorHistory } = require("../services/core/farmHistoryService");
const { streamFarmState: streamFarmStateService } = require("../services/core/farmRealtimeStreamService");
const { ingestSensorPayload } = require("../services/core/farmSensorIngestionService");
const { setControlMode, overrideActuatorFields } = require("../services/core/farmActuatorService");
const { validateIngestPayload } = require("../services/core/farmIngestValidationService");
const { decideAiTrigger } = require("../services/core/farmAiTriggerService");
const { CROP_STAGES } = require("../services/core/farmPayloadMapper");
const { getDb } = require("../config/mongodb");
const { getLatestPlan } = require("../services/ai/proactivePlanningService");
const { runDailyProactivePlanning } = require("../services/ai/proactivePlanningService");
const { saveDecisionFeedback, getPolicySummary } = require("../services/ai/policyLearningService");
const { runEvaluatorAgent, buildRLHFMemoryBlock } = require("../agent/agentEvaluator");

async function buildStatePayload(root, limit) {
  const sensorHistory = await getLatestSensorHistory(30);
  return buildFarmStatePayload(root, limit, sensorHistory);
}

async function getFarmState(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.logLimit || 20), 1), 100);
    const snapshot = await db.ref("/SalinAI").once("value");
    const root = snapshot.val() || {};

    res.status(200).json(await buildStatePayload(root, limit));
  } catch (error) {
    console.error("[Farm API] Failed to read farm state:", error.message);
    res.status(500).json({ error: "Failed to read farm state", details: error.message });
  }
}

function streamFarmState(req, res) {
  return streamFarmStateService(req, res, {
    rootRef: db.ref("/SalinAI"),
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

    // 4. Note: AI Triggering is now handled globally by farmFirebaseWatcher.js 
    // to prevent duplicate executions from different ingestion sources.
    if (shouldTriggerAI) {
      console.log(`[Ingest API] 🤖 AI Trigger Candidate: ${triggerReason} (Delegating to Watcher)`);
    }

    return res.status(200).json({
      status: "OK",
      message: "Data synced. Watcher will handle AI trigger if needed.",
      updated: enrichedPayload
    });

  } catch (error) {
    console.error("[Ingest API] ❌ Internal Error:", error.message);
    if (error.status) {
      return res.status(error.status).json(error.payload || { error: error.message });
    }
    res.status(500).json({ error: "Internal Server Error", details: error.message });
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

async function submitDecisionFeedback(req, res) {
  try {
    const actionLogId = String(req.body?.action_log_id || "").trim();
    const verdict = req.body?.verdict;
    const notes = req.body?.notes || "";
    const correctedAction = req.body?.corrected_action || null;

    if (!actionLogId) {
      return res.status(400).json({ error: "action_log_id is required" });
    }

    const actionSnapshot = await db.ref(`SalinAI/action_logs/${actionLogId}`).once("value");
    const actionLog = actionSnapshot.val();

    if (!actionLog) {
      return res.status(404).json({ error: "Action log not found" });
    }

    const result = await saveDecisionFeedback({
      action_log_id: actionLogId,
      verdict,
      notes,
      corrected_action: correctedAction,
      action: actionLog.action,
      reason: actionLog.reason,
      sensor_snapshot: actionLog.sensor_snapshot || {},
      source_ids: actionLog.retrieval?.source_ids || [],
    });

    return res.status(200).json({
      status: "OK",
      message: "Feedback saved and policy memory refreshed.",
      feedback_id: result.feedbackId,
      policy: result.policy,
    });
  } catch (error) {
    if (String(error.message || "").includes("verdict")) {
      return res.status(400).json({ error: error.message });
    }
    console.error("[Farm API] Failed to submit decision feedback:", error.message);
    return res.status(500).json({ error: "Failed to submit decision feedback", details: error.message });
  }
}

async function getAgentPolicySummary(req, res) {
  try {
    const policy = await getPolicySummary();
    return res.status(200).json({
      status: "OK",
      policy,
    });
  } catch (error) {
    console.error("[Farm API] Failed to get policy summary:", error.message);
    return res.status(500).json({ error: "Failed to get policy summary", details: error.message });
  }
}

/**
 * POST /api/evaluate-feedback  [E2-B2]
 * Triggers the Evaluator Agent (SAOLA4_MEDIUM) on a negative farmer verdict.
 * Saves a structured lesson to MongoDB `lessons_learned`.
 *
 * Body: { action_log_id, verdict: "incorrect", notes, corrected_action? }
 */
async function evaluateFeedback(req, res) {
  try {
    const actionLogId = String(req.body?.action_log_id || "").trim();
    const verdict = String(req.body?.verdict || "").toLowerCase().trim();
    const notes = String(req.body?.notes || "").trim();

    if (!actionLogId) {
      return res.status(400).json({ error: "action_log_id is required" });
    }
    if (verdict !== "incorrect") {
      return res.status(400).json({
        error: "verdict must be 'incorrect' to trigger Evaluator Agent",
      });
    }
    if (!notes) {
      return res.status(400).json({ error: "notes (farmer reason) is required" });
    }

    // Fetch action log from Firebase
    const actionSnapshot = await db.ref(`SalinAI/action_logs/${actionLogId}`).once("value");
    const actionLog = actionSnapshot.val();
    if (!actionLog) {
      return res.status(404).json({ error: "Action log not found in Firebase" });
    }

    // Run Evaluator Agent asynchronously (non-blocking response)
    // We respond immediately so the UI isn't blocked, then run in background
    res.status(202).json({
      status: "ACCEPTED",
      message: "Phản hồi đã nhận. AI đang học từ nhận xét của bạn...",
      action_log_id: actionLogId,
    });

    // Background: run Evaluator Agent + save lesson
    runEvaluatorAgent({ action_log_id: actionLogId, action_log: actionLog, verdict, notes })
      .then((lesson) => {
        if (lesson) {
          console.log(`[Evaluator API] ✅ Bài học đã lưu cho action_log ${actionLogId}`);
        }
      })
      .catch((err) => {
        console.error(`[Evaluator API] ❌ Evaluator Agent thất bại:`, err.message);
      });

  } catch (error) {
    console.error("[Evaluator API] Internal error:", error.message);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}

/**
 * GET /api/lessons-learned  [E2-B3]
 * Returns the top-10 most recent lessons extracted by the Evaluator Agent.
 * Used by the Dashboard's "💡 Bài học gần đây" panel.
 *
 * Query params:
 *   limit  — number of lessons (default 10, max 50)
 */
async function getLessonsLearned(req, res) {
  try {
    const mongoDb = getDb();
    if (!mongoDb) {
      return res.status(503).json({ error: "MongoDB not connected" });
    }

    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);

    const lessons = await mongoDb
      .collection("lessons_learned")
      .find({})
      .sort({ created_at: -1 })
      .limit(limit)
      .project({
        _id: 1,
        action_log_id: 1,
        condition_pattern: 1,
        action_taken: 1,
        correct_action: 1,
        lesson_text: 1,
        root_cause: 1,
        farmer_notes: 1,
        created_at_vn: 1,
        feedback_source: 1,
      })
      .toArray();

    return res.status(200).json({
      status: "OK",
      count: lessons.length,
      lessons,
    });
  } catch (error) {
    console.error("[Lessons API] Error:", error.message);
    return res.status(500).json({ error: "Failed to fetch lessons", details: error.message });
  }
}

async function updateCropStage(req, res) {
  try {
    const nextStage = String(req.body?.crop_stage || "").trim().toUpperCase();

    if (!CROP_STAGES.includes(nextStage)) {
      return res.status(400).json({
        error: "Invalid crop_stage",
        allowed: CROP_STAGES,
      });
    }

    const sensorRef = db.ref("SalinAI/sensor_data");
    await sensorRef.update({
      crop_stage: nextStage,
      timestamp: new Date().toISOString(),
    });

    const updatedSnapshot = await sensorRef.once("value");

    return res.status(200).json({
      status: "OK",
      updated: updatedSnapshot.val() || { crop_stage: nextStage },
    });
  } catch (error) {
    console.error("[Farm API] Failed to update crop stage:", error.message);
    return res.status(500).json({ error: "Failed to update crop stage", details: error.message });
  }
}

async function getIrrigationPlan(req, res) {
  try {
    const plan = await getLatestPlan();
    return res.status(200).json(plan);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}


async function triggerProactivePlanning(req, res) {
  try {
    await runDailyProactivePlanning();
    return res.status(200).json({ message: "Proactive planning triggered successfully." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getFarmState,
  streamFarmState,
  ingestData,
  updateControlMode,
  overrideActuator,
  submitDecisionFeedback,
  getAgentPolicySummary,
  updateCropStage,
  evaluateFeedback,
  getLessonsLearned,
  getIrrigationPlan,
  triggerProactivePlanning,
};
