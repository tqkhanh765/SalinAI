const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { researcherTools, orchestratorTools } = require("./tools");
const fbdb = require("../config/firebase");
const { logActionWithPrediction } = require("../services/outcomeService");

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash", 
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  temperature: 0.2
});

const researcherAgent = llm.bindTools(researcherTools);
const orchestratorAgent = llm.bindTools(orchestratorTools);

async function finalizeAction({
    actionResult,
    sensorData,
    finalHitCount,
    finalSourceIds,
    researcherSummary,
    actor,
    mongoDb,
}) {
    if (!actionResult) {
        return;
    }

    if (!actionResult.blocked_by_manual && (actionResult.executed_state === "OPEN" || actionResult.executed_state === "CLOSED")) {
        await fbdb.ref("actuator/valve_state").set(actionResult.executed_state);

        // Mirror to SalinAI/control/action — the path the Wokwi ESP32 reads (sketch.ino line 86).
        // The sketch checks for "OPEN" or "CLOSE" (not "CLOSED"), so translate accordingly.
        const esp32Action = actionResult.executed_state === "OPEN" ? "OPEN" : "CLOSE";
        await fbdb.ref("SalinAI/control/action").set(esp32Action);
    }

    await fbdb.ref("ai_status").update({
        is_processing: false,
        last_reasoning: actionResult.reason,
        last_retrieval_hit_count: finalHitCount,
        last_retrieval_source_ids: finalSourceIds,
    });

    const actionLogPayload = {
        timestamp: new Date().toISOString(),
        actor,
        action: actionResult.executed_state,
        reason: actionResult.reason + (actionResult.blocked_by_manual ? " (BLOCKED BY MANUAL MODE)" : ""),
        retrieval: {
            hit_count: finalHitCount,
            source_ids: finalSourceIds,
            retrieval_miss: finalHitCount === 0,
        },
        sensor_snapshot: sensorData,
        subagent_summary: researcherSummary,
    };

    await fbdb.ref("action_logs").push(actionLogPayload);

    if (mongoDb) {
        // Log with predictions for 24h outcome tracking
        await logActionWithPrediction(actionLogPayload);
    }
}

module.exports = {
    researcherAgent,
    orchestratorAgent,
    finalizeAction,
};
