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

    console.log("[Listener] Detected new sensor data, executing pipeline...");
    
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
