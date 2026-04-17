const express = require("express");
const router = express.Router();
const farmController = require("../controllers/farmController");
const { formatDecisionDisplay } = require("../services/ai/explanationService");
const db = require("../config/firebase");

router.get("/api/farm-state", farmController.getFarmState);
router.get("/api/farm-stream", farmController.streamFarmState);
router.post("/api/ingest", farmController.ingestData);
router.post("/api/decision-feedback", farmController.submitDecisionFeedback);
router.get("/api/policy-summary", farmController.getAgentPolicySummary);
router.patch("/api/control-mode", farmController.updateControlMode);
router.patch("/api/crop-stage", farmController.updateCropStage);
router.post("/api/override", farmController.overrideActuator);

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
            db.ref("sensor_data").once("value"),
            db.ref("ai_status").once("value"),
            db.ref("actuator").once("value"),
            db.ref("action_logs").limitToLast(1).once("value"),
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