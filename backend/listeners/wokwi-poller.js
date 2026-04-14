/**
 * Wokwi Sensor Poller
 *
 * Replaces the manual "Kích hoạt AI Agent" button and the firebase-listener.
 *
 * Every 10 seconds this service:
 *   1. Reads salinity, soil_moisture, water_flow from SalinAI/sensors/ (pushed by ESP32)
 *   2. Fetches live weather data from Open-Meteo via weatherService
 *   3. Builds an enriched sensor payload (crop_stage hardcoded as VEGETATIVE)
 *   4. Writes the payload to sensor_data  → frontend SSE stream picks this up
 *   5. Calls runAgent() directly           → AI decides valve state, writes to Firebase
 *   6. Also mirrors valve decision to SalinAI/control/action → ESP32 reads this
 */

const fbdb = require("../config/firebase");
const { fetchWeatherData } = require("../services/weatherService");
const { getTideData } = require("../services/tideService");
const { persistSensorHistoryPoint } = require("../services/farmHistoryService");
const { runAgent } = require("../agent/langchain");

const POLL_INTERVAL_MS = Math.max(
  5000,
  parseInt(process.env.WOKWI_POLL_INTERVAL_MS || "10000", 10)
);

let pollerInterval = null;
let isAgentRunning = false; // guard against overlapping runs

async function pollWokwiSensors() {
  // Skip this tick if the previous agent run hasn't finished yet
  if (isAgentRunning) {
    console.log("[Wokwi Poller] ⏭  Previous agent run still in progress. Skipping tick.");
    return;
  }

  try {
    // ── 1. Read raw sensor data pushed by ESP32 ───────────────────────────
    const snapshot = await fbdb.ref("SalinAI/sensors").once("value");
    const rawSensors = snapshot.val();

    if (!rawSensors) {
      console.log("[Wokwi Poller] ⚠  No sensor data at SalinAI/sensors/ yet. Waiting for ESP32...");
      return;
    }

    const salinity   = Number(rawSensors.salinity    ?? 0);
    const moisture   = Number(rawSensors.soil_moisture ?? 0);
    const waterFlow  = Number(rawSensors.water_flow   ?? 0);

    console.log(`[Wokwi Poller] 📡 Sensors → Sal: ${salinity} ppt | Moisture: ${moisture}% | Flow: ${waterFlow} L/min`);

    // ── 2. Fetch weather + tide (cached, so cheap) ────────────────────────
    const [weatherData, tideData] = await Promise.all([
      fetchWeatherData(),
      getTideData(null, {}),
    ]);

    // ── 3. Build fully-enriched sensor payload ────────────────────────────
    const enrichedPayload = {
      salinity,
      moisture,
      river_salinity:    salinity,
      soil_moisture:     moisture,
      water_flow:        waterFlow,
      crop_stage:        "VEGETATIVE", // hardcoded per requirement
      timestamp:         new Date().toISOString(),
      station_metadata: {
        crop_type:    "RICE",
        growth_stage: "VEGETATIVE",
        field_name:   "Thửa ruộng A-01",
      },
      external_forecast: {
        temperature:  weatherData?.temperature  ?? null,
        humidity:     weatherData?.humidity     ?? null,
        rainfall_24h: weatherData?.rainfall_24h ?? null,
        weather_code: weatherData?.weather_code ?? null,
        tide_status:  tideData?.tide_status     ?? weatherData?.tide_status ?? "FALLING",
        confidence_score: tideData?.confidence_score ?? 0.5,
        source:       weatherData?.source       ?? "UNKNOWN",
      },
    };

    // ── 4. Write to sensor_data → frontend re-renders via SSE stream ───────
    await fbdb.ref("sensor_data").set(enrichedPayload);
    await persistSensorHistoryPoint(enrichedPayload);

    // ── 5. Mark AI as processing & run the agent ──────────────────────────
    await fbdb.ref("ai_status").update({ is_processing: true });
    isAgentRunning = true;

    runAgent(enrichedPayload)
      .catch((err) => {
        console.error("[Wokwi Poller] ❌ Agent pipeline error:", err.message);
        fbdb.ref("ai_status").update({
          is_processing: false,
          last_reasoning: `Agent pipeline failed: ${err.message}`,
        });
      })
      .finally(() => {
        isAgentRunning = false;
      });

  } catch (err) {
    console.error("[Wokwi Poller] ❌ Polling error:", err.message);
    isAgentRunning = false;
  }
}

function startWokwiPoller() {
  console.log(`[Wokwi Poller] 🚀 Starting — polling SalinAI/sensors/ every ${POLL_INTERVAL_MS / 1000}s`);

  // Reset AI status on startup
  fbdb.ref("ai_status").update({
    is_processing: false,
    last_reasoning: "Wokwi Poller started. Waiting for first sensor reading...",
  }).catch((err) => {
    console.error("[Wokwi Poller] Failed to reset ai_status:", err.message);
  });

  // First poll immediately, then on schedule
  pollWokwiSensors();
  pollerInterval = setInterval(pollWokwiSensors, POLL_INTERVAL_MS);
}

function stopWokwiPoller() {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log("[Wokwi Poller] 🛑 Stopped.");
  }
}

module.exports = { startWokwiPoller, stopWokwiPoller };
