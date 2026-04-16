const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatOpenAI } = require("@langchain/openai");
const { orchestratorTools } = require("./tools");
const fbdb = require("../config/firebase");
const { logActionWithPrediction } = require("../services/ai/outcomeService");

function createOrchestrationLLM() {
    const provider = String(process.env.AI_PROVIDER).toLowerCase();
    const temperature = Number(process.env.LLM_TEMPERATURE || "0.2");

    if (provider === "saola") {
        const apiKey = process.env.SAOLA_API_KEY;
        const baseURL = process.env.SAOLA_BASE_URL;
        const model = process.env.SAOLA_MODEL || "saola-chat";

        if (!apiKey || !baseURL) {
            throw new Error("AI_PROVIDER=saola requires SAOLA_API_KEY and SAOLA_BASE_URL");
        }

        return new ChatOpenAI({
            model,
            apiKey,
            temperature,
            configuration: {
                baseURL,
            },
        });
    }

    return new ChatGoogleGenerativeAI({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        temperature,
    });
}

const llm = createOrchestrationLLM();

const orchestratorAgent = llm.bindTools(orchestratorTools);

async function finalizeAction({
    actionResult,
    sensorData,
    finalHitCount,
    finalSourceIds,
    researcherSummary,
    actor,
    mongoDb,
    agentTrace = [],
    modelInsights = {},
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
        agent_trace: agentTrace,
        model_insights: modelInsights,
    };

    await fbdb.ref("action_logs").push(actionLogPayload);

    if (mongoDb) {
        // Log with predictions for 24h outcome tracking
        await logActionWithPrediction(actionLogPayload);
    }
}

module.exports = {
    orchestratorAgent,
    finalizeAction,
};
