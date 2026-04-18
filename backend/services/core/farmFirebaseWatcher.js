/**
 * Firebase Watcher Service.
 * Listens to realtime changes in SalinAI/sensor_data and triggers the AI pipeline 
 * if significant changes are detected. This allows hardware (like Wokwi or ESP32) 
 * to skip the REST API and write directly to Firebase while still benefiting from AI.
 */
const db = require("../../config/firebase");
const { getLatestSensorHistory, persistSensorHistoryPoint } = require("./farmHistoryService");
const { decideAiTrigger } = require("./farmAiTriggerService");
const { runAgent } = require("../../agent/langchain");
const { fetchWeatherData } = require("../external/weatherService");
const { getTideData } = require("../external/tideService");

let lastProcessedTimestamp = null;

function startFirebaseWatcher() {
  console.log("   -> Firebase Watcher enabled (Listening to SalinAI/sensor_data)");

  const sensorRef = db.ref("SalinAI/sensor_data");

  sensorRef.on("value", async (snapshot) => {
    try {
      const sensorData = snapshot.val();
      if (!sensorData || !sensorData.timestamp) return;

      // Avoid re-processing the same update (idempotency)
      if (sensorData.timestamp === lastProcessedTimestamp) return;
      lastProcessedTimestamp = sensorData.timestamp;

      // 1. Fetch Weather & Tide early to enrich the data
      const weatherData = await fetchWeatherData().catch(() => null);
      const tideData = await getTideData(sensorData.river_water_level, weatherData).catch(() => null);

      const enrichedData = {
        ...sensorData,
        external_forecast: {
          ...weatherData,
          ...tideData,
        }
      };

      // Update Firebase immediately so the UI (Dashboard) shows the weather data
      // We use update() to merge, and lastProcessedTimestamp will prevent Infinite Loops.
      await db.ref("SalinAI/sensor_data").update({
        external_forecast: enrichedData.external_forecast
      }).catch(err => console.error("[Firebase Watcher] ❌ UI Update failed:", err.message));

      // 2. Get previous point from history to compare deltas
      const history = await getLatestSensorHistory(1);
      const previousPoint = history.length > 0 ? history[0] : null;

      // 3. Persist to MongoDB History immediately so next update has a reference
      await persistSensorHistoryPoint(enrichedData);

      // 4. Decide if AI should trigger
      const { shouldTriggerAI, triggerReason } = decideAiTrigger(enrichedData, previousPoint);

      if (shouldTriggerAI) {
        console.log(`[Firebase Watcher] 🤖 AI Triggered via DB update: ${triggerReason}`);

        await db.ref("SalinAI/ai_status").update({
          is_processing: true,
          last_reasoning: `Triggered by DB: ${triggerReason}`,
        });

        // Run Agent pipeline with enriched data
        runAgent(enrichedData).catch(err => {
          console.error("[Firebase Watcher] ❌ AI Agent failure:", err.message);
          db.ref("SalinAI/ai_status").update({
            is_processing: false,
            last_reasoning: `AI Error (Watcher): ${err.message}`,
          });
        });
      }

    } catch (error) {
      console.error("[Firebase Watcher] Error:", error.message);
    }
  });
}

module.exports = { startFirebaseWatcher };
