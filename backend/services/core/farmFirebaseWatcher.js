const db = require("../../config/firebase");
const { getLatestSensorHistory, persistSensorHistoryPoint } = require("./farmHistoryService");
const { decideAiTrigger } = require("./farmAiTriggerService");
const { runAgent } = require("../../agent/langchain");
const { fetchWeatherData } = require("../external/weatherService");
const { getTideData } = require("../external/tideService");

let lastProcessedTimestamp = null;
let lastProcessedFingerprint = ""; 
let isAiTriggerLocked = false;    
let isWatcherStarted = false; 
const TRIGGER_COOLDOWN_MS = 8000; 

function startFirebaseWatcher() {
  if (isWatcherStarted) return;
  isWatcherStarted = true;
  console.log("   -> Firebase Watcher enabled (SalinAI/sensor_data)");

  const sensorRef = db.ref("SalinAI/sensor_data");
  let isAddingEnrichment = false;

  let isInitialSnapshot = true;
  sensorRef.on("value", async (snapshot) => {
    try {
      const sensorData = snapshot.val();
      if (!sensorData || !sensorData.timestamp) return;

      // Skip the very first trigger that Firebase always sends on connect
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        const fingerprint = `${sensorData.salinity}-${sensorData.moisture}-${sensorData.timestamp}`;
        lastProcessedFingerprint = fingerprint;
        return;
      }

      const fingerprint = `${sensorData.salinity}-${sensorData.moisture}-${sensorData.timestamp}`;
      if (fingerprint === lastProcessedFingerprint || isAddingEnrichment) return;


      lastProcessedFingerprint = fingerprint;
      lastProcessedTimestamp = sensorData.timestamp;
      isAddingEnrichment = true;

      const weatherData = await fetchWeatherData().catch(() => null);
      const tideData = await getTideData(sensorData.river_water_level, weatherData).catch(() => null);

      const enrichedData = {
        ...sensorData,
        external_forecast: { ...weatherData, ...tideData }
      };

      await db.ref("SalinAI/sensor_enrichment").update({
        external_forecast: enrichedData.external_forecast
      }).catch(() => {});

      const history = await getLatestSensorHistory(1);
      const previousPoint = history.length > 0 ? history[0] : null;

      const { shouldTriggerAI, triggerReason } = await decideAiTrigger(enrichedData, previousPoint);
      await persistSensorHistoryPoint(enrichedData);

      if (shouldTriggerAI) {
        if (isAiTriggerLocked) return;
        isAiTriggerLocked = true;
        console.log(`[Firebase Watcher] 🤖 AI Triggered (PID: ${process.pid}): ${triggerReason}`);

        await db.ref("SalinAI/ai_status").update({
          is_processing: true,
          last_reasoning: `Triggered: ${triggerReason}`,
        });

        runAgent(enrichedData)
          .then(() => {
            setTimeout(() => { isAiTriggerLocked = false; }, TRIGGER_COOLDOWN_MS);
          })
          .catch(() => {
            db.ref("SalinAI/ai_status").update({ is_processing: false });
            isAiTriggerLocked = false;
          });
      }
    } catch (error) {
      console.error("[Firebase Watcher] Error:", error.message);
    } finally {
      isAddingEnrichment = false;
    }
  });
}

module.exports = { startFirebaseWatcher };
