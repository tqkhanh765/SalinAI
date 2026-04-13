const fbdb = require("../config/firebase");
const { runAgent } = require("../agent/langchain");

let lastInvokeTime = 0;
const DEBOUNCE_MS = Math.max(500, parseInt(process.env.AGENT_DEBOUNCE_MS || "2000", 10));
let hasInitializedListener = false;
let lastProcessedTimestamp = null;
let lastSensorSignature = null;

function startListener() {
  console.log("[Listener] Starting Firebase sensor_data listener...");

  fbdb.ref("ai_status").update({
    is_processing: false,
    last_reasoning: "Idle",
  }).catch((err) => {
    console.error("[Listener] Failed to reset ai_status on startup:", err.message);
  });

  fbdb.ref("sensor_data").on("value", async (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const timestamp = data.timestamp || null;
    const signature = `${Number(data.salinity || 0)}|${Number(data.moisture || 0)}|${data.crop_stage || ""}|${data.weather || ""}|${timestamp || ""}`;

    // Firebase emits current value immediately on subscription; treat it as baseline, not a new trigger.
    if (!hasInitializedListener) {
      hasInitializedListener = true;
      lastProcessedTimestamp = timestamp;
      lastSensorSignature = signature;
      console.log("[Listener] Baseline sensor_data loaded. Waiting for new updates...");
      return;
    }

    if ((timestamp && timestamp === lastProcessedTimestamp) || signature === lastSensorSignature) {
      console.log("[Listener] Ignored duplicate sensor payload.");
      return;
    }

    lastProcessedTimestamp = timestamp;
    lastSensorSignature = signature;

    const now = Date.now();
    if (now - lastInvokeTime < DEBOUNCE_MS) {
      console.log("[Listener] Ignored update (debouncing).");
      return;
    }
    lastInvokeTime = now;

    console.log(`[Listener] Received raw sensor data -> Salinity: ${data.salinity}, Moisture: ${data.moisture}`);

    // --- Enterprise Cost-Saving Pre-Filter ---
    // If conditions are absolutely perfect, do not waste money invoking the AI LLM
    if (data.salinity < 1.0 && data.moisture > 40 && data.moisture < 80) {
        console.log("[Filter] 🟢 Conditions are nominal. Data dropped. Bypassing AI pipeline to save LLM API costs.");
        return;
    }
    
    console.log("[Filter] 🔴 Anomaly detected! Threshold crossed. Waking up Langgraph Agents...");
    
    // Set AI status to processing
    await fbdb.ref("ai_status").update({ is_processing: true });

    // Run pipeline autonomously
    runAgent(data).catch((err) => {
      console.error("[Listener] Agent pipeline error:", err);
      fbdb.ref("ai_status").update({ is_processing: false, last_reasoning: "Agent pipeline failed." });
    });
  });
}

module.exports = { startListener };
