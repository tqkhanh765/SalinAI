/**
 * Auto-learning scheduler.
 * Boots the background loop that evaluates delayed outcomes and updates policy memory.
 */
const { runAutonomousLearningCycle } = require("./outcomeService");

const AUTO_LEARNING_ENABLED = String(process.env.AUTO_LEARNING_ENABLED || "true").toLowerCase() === "true";
const AUTO_LEARNING_INTERVAL_MS = Math.max(
  60 * 1000,
  parseInt(process.env.AUTO_LEARNING_INTERVAL_MS || "900000", 10)
);
const AUTO_LEARNING_INITIAL_DELAY_MS = Math.max(
  1000,
  parseInt(process.env.AUTO_LEARNING_INITIAL_DELAY_MS || "10000", 10)
);

function startAutoLearningScheduler() {
  if (!AUTO_LEARNING_ENABLED) {
    return {
      enabled: false,
      intervalMs: AUTO_LEARNING_INTERVAL_MS,
    };
  }

  console.log(`   -> Auto-learning loop enabled (${Math.round(AUTO_LEARNING_INTERVAL_MS / 60000)} min interval)`);

  const runCycle = async () => {
    try {
      const result = await runAutonomousLearningCycle();
      if (result.evaluated > 0 || result.feedbackInserted > 0) {
        console.log(
          `[AutoLearning] evaluated=${result.evaluated}, feedbackInserted=${result.feedbackInserted}, feedbackSkipped=${result.feedbackSkipped}`
        );
      }
    } catch (error) {
      console.error("[AutoLearning] Cycle error:", error.message);
    }
  };

  setTimeout(runCycle, AUTO_LEARNING_INITIAL_DELAY_MS);
  setInterval(runCycle, AUTO_LEARNING_INTERVAL_MS);

  return {
    enabled: true,
    intervalMs: AUTO_LEARNING_INTERVAL_MS,
  };
}

module.exports = {
  startAutoLearningScheduler,
};
