const express = require("express");
const router = express.Router();

// ─── Dependencies ─────────────────────────────────────────────────────────────
const db = require("../config/firebase");
const mongoConfig = require("../config/mongodb");
const { fetchWeatherData } = require("../services/external/weatherService");

/**
 * GET /api/health
 * Confirms the server is running and checks database connections.
 */
router.get("/api/health", async (req, res) => {
  try {
    // 1. Check Firebase
    const snapshot = await db.ref(".info/connected").once("value");
    const firebaseConnected = snapshot.val();

    // 2. Check MongoDB
    let mongodbConnected = false;
    if (mongoConfig.client) {
      try {
        await mongoConfig.client.db().command({ ping: 1 });
        mongodbConnected = true;
      } catch (err) {
        mongodbConnected = false;
      }
    }

    // 3. Check Last AI Run
    let lastAiRun = null;
    try {
      const logSnap = await db.ref("SalinAI/action_logs").orderByChild("timestamp").limitToLast(1).once("value");
      if (logSnap.exists()) {
        const logs = logSnap.val();
        const key = Object.keys(logs)[0];
        lastAiRun = logs[key].timestamp;
      }
    } catch (e) {
      console.warn("[Health] Failed to fetch last AI run:", e.message);
    }

    res.status(200).json({
      status: "OK",
      timestamp: new Date().toISOString(),
      firebase: firebaseConnected ? "CONNECTED" : "DISCONNECTED",
      mongodb: mongodbConnected ? "CONNECTED" : "DISCONNECTED",
      last_ai_run: lastAiRun || "UNKNOWN"
    });
  } catch (error) {
    console.error("[Health Check] API error:", error.message);
    res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
});

/**
 * GET /api/weather
 * Fetches current weather data from Open-Meteo API
 */
router.get("/api/weather", async (req, res) => {
  try {
    const weatherData = await fetchWeatherData();
    res.status(200).json({
      status: "OK",
      timestamp: new Date().toISOString(),
      weather: weatherData
    });
  } catch (error) {
    console.error("[Weather API] Error:", error.message);
    res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
});

module.exports = router;
