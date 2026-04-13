const fbdb = require("../config/firebase");
const { runAgent } = require("../agent/langchain");

let lastInvokeTime = 0;
const DEBOUNCE_MS = 10000; // 10 seconds

function startListener() {
  console.log("[Listener] Starting Firebase sensor_data listener...");

  fbdb.ref("sensor_data").on("value", async (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

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
