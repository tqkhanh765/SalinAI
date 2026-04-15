const express = require("express");
const router = express.Router();
const farmController = require("../controllers/farmController");
const { formatDecisionDisplay } = require("../services/explanationService");
const db = require("../config/firebase");

router.get("/api/farm-state", farmController.getFarmState);
router.get("/api/farm-stream", farmController.streamFarmState);
router.post("/api/ingest", farmController.ingestData);
router.patch("/api/control-mode", farmController.updateControlMode);
router.post("/api/override", farmController.overrideActuator);

/**
 * GET /api/decision-details
 * Return formatted decision data for Dashboard
 * Includes: all metrics, weather, tide, AI reasoning, guidelines
 */
router.get("/api/decision-details", async (req, res) => {
    try {
        const snapshot = await db.ref("/").once("value");
        const root = snapshot.val() || {};
        
        const sensorData = root.sensor_data || {};
        const externalForecast = (root.sensor_data?.external_forecast) || {};
        const tideData = (root.sensor_data?.external_forecast) || {};
        const aiStatus = root.ai_status || {};
        const actuator = root.actuator || {};
        const actionLogs = root.action_logs || {};

        // Extract latest action for decision details
        const latestAction = Object.values(actionLogs).sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        )[0] || {};

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