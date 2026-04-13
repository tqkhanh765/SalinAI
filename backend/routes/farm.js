const express = require("express");
const router = express.Router();
const farmController = require("../controllers/farmController");

router.get("/api/farm-state", farmController.getFarmState);
router.get("/api/farm-stream", farmController.streamFarmState);
router.post("/api/sensor-data", farmController.submitSensorData);
router.patch("/api/control-mode", farmController.updateControlMode);
router.post("/api/override", farmController.overrideActuator);

module.exports = router;