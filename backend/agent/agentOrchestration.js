const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { researcherTools, orchestratorTools } = require("./tools");
const fbdb = require("../config/firebase");

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
        await mongoDb.collection("action_logs").insertOne(actionLogPayload);
    }
}

module.exports = {
    researcherAgent,
    orchestratorAgent,
    finalizeAction,
};
