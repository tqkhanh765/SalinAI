const express = require("express");
const router = express.Router();
const farmController = require("../controllers/farmController");
const { formatDecisionDisplay } = require("../services/ai/explanationService");
const db = require("../config/firebase");
const { subscribeAiStream, getCurrentAiStream } = require("../services/core/aiStreamService");

router.get("/api/farm-state", farmController.getFarmState);
router.get("/api/farm-stream", farmController.streamFarmState);
router.post("/api/ingest", farmController.ingestData);
router.post("/api/sensor-data", farmController.ingestData);
router.post("/api/decision-feedback", farmController.submitDecisionFeedback);
router.get("/api/policy-summary", farmController.getAgentPolicySummary);
router.patch("/api/control-mode", farmController.updateControlMode);
router.patch("/api/crop-stage", farmController.updateCropStage);
router.get("/api/ping-test", (req, res) => res.json({ message: "Active backend is here!", timestamp: new Date().toISOString() }));
router.post("/api/override", farmController.overrideActuator);

router.get("/api/ai-stream", (req, res) => {
    res.status(200);
    res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });

    if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
    }

    const writeEvent = (eventName, payload) => {
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    writeEvent("snapshot", getCurrentAiStream() || { status: "idle" });

    const keepAlive = setInterval(() => {
        res.write(": ping\n\n");
    }, 15000);

    const unsubscribe = subscribeAiStream((event) => {
        if (!event || !event.type) return;

        if (event.type === "done") {
            writeEvent("done", event.payload || {});
            res.write("data: [DONE]\n\n");
            clearInterval(keepAlive);
            unsubscribe();
            res.end();
            return;
        }

        writeEvent(event.type, event.payload || {});
    }, { replay: false });

    req.on("close", () => {
        clearInterval(keepAlive);
        unsubscribe();
    });
});

// ─── RLHF & Evaluator Agent (Epic 2) ─────────────────────────────────────────
// Triggers SAOLA4_MEDIUM Evaluator Agent on negative feedback → saves lesson to MongoDB
router.post("/api/evaluate-feedback", farmController.evaluateFeedback);
// Returns top-N lessons extracted by Evaluator Agent (for Dashboard "💡 Bài học gần đây")
router.get("/api/lessons-learned", farmController.getLessonsLearned);

// ─── Proactive Forecasting (Epic 3) ──────────────────────────────────────────
router.get("/api/irrigation-plan", farmController.getIrrigationPlan);
router.post("/api/irrigation-plan/trigger", farmController.triggerProactivePlanning);


/**
 * GET /api/decision-details
 * Return formatted decision data for Dashboard
 * Includes: all metrics, weather, tide, AI reasoning, guidelines
 */
router.get("/api/decision-details", async (req, res) => {
    try {
        const [
            sensorSnapshot,
            aiStatusSnapshot,
            actuatorSnapshot,
            latestActionSnapshot,
        ] = await Promise.all([
            db.ref("SalinAI/sensor_data").once("value"),
            db.ref("SalinAI/ai_status").once("value"),
            db.ref("SalinAI/actuator").once("value"),
            db.ref("SalinAI/action_logs").limitToLast(1).once("value"),
        ]);

        const sensorData = sensorSnapshot.val() || {};
        const externalForecast = sensorData?.external_forecast || {};
        const tideData = sensorData?.external_forecast || {};
        const aiStatus = aiStatusSnapshot.val() || {};
        const actuator = actuatorSnapshot.val() || {};
        const latestActionMap = latestActionSnapshot.val() || {};
        const latestAction = Object.values(latestActionMap)[0] || {};

        const decision = {
            executed_state: actuator.valve_state,
            reason: latestAction.reason || "N/A",
            source_ids: latestAction.retrieval?.source_ids || [],
            timestamp: latestAction.timestamp || new Date().toISOString()
        };

        const guidelines = latestAction.retrieval?.source_ids || [];

        // Format for frontend
        const formatted = formatDecisionDisplay(
            sensorData,
            externalForecast,
            tideData,
            guidelines,
            decision,
            aiStatus
        );

        res.status(200).json({
            timestamp: new Date().toISOString(),
            data: formatted
        });

    } catch (error) {
        console.error("[Decision Details API] Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;