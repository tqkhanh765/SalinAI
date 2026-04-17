const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatOpenAI } = require("@langchain/openai");
const { orchestratorTools } = require("./tools");
const fbdb = require("../config/firebase");
const { logActionWithPrediction, runAutonomousLearningCycle } = require("../services/ai/outcomeService");
const { toVietnamISOString, addHoursVietnamISOString } = require("../utils/vietnamTime");
const FEEDBACK_LOOP_DELAY_HOURS = Math.max(0, Number(process.env.OUTCOME_MIN_ACTION_AGE_HOURS || "1"));

function normalizeOrchestratorProvider() {
    return String(process.env.AI_PROVIDER || "gemini").toLowerCase();
}

function createOrchestrationLLM() {
    const provider = normalizeOrchestratorProvider();
    const temperature = Number(process.env.LLM_TEMPERATURE || "0.2");

    if (provider === "saola_planner") {
        const apiKey = process.env.SAOLA_PLANNER_API_KEY;
        const baseURL = process.env.SAOLA_PLANNER_BASE_URL;
        const model = process.env.SAOLA_PLANNER_MODEL || "saola-chat";

        if (!apiKey || !baseURL) {
            throw new Error("AI_PROVIDER=saola_planner requires SAOLA_PLANNER_API_KEY and SAOLA_PLANNER_BASE_URL");
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

    const actionTimestamp = toVietnamISOString();

    const actionLogPayload = {
        timestamp: actionTimestamp,
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
        feedback_loop: {
            status: "PENDING_OUTCOME",
            stage: sensorData?.crop_stage || "VEGETATIVE",
            action_at: actionTimestamp,
            next_check_at: addHoursVietnamISOString(FEEDBACK_LOOP_DELAY_HOURS),
            note: `Đang chờ outcome sau ${FEEDBACK_LOOP_DELAY_HOURS} giờ để cập nhật policy memory.`,
        },
    };

    await fbdb.ref("action_logs").push(actionLogPayload);

    if (mongoDb) {
        // Log with predictions for 24h outcome tracking
        await logActionWithPrediction(actionLogPayload);

        await fbdb.ref("ai_status").update({
            feedback_loop: {
                status: "PENDING_OUTCOME",
                stage: sensorData?.crop_stage || "VEGETATIVE",
                action: actionResult.executed_state,
                action_at: actionLogPayload.timestamp,
                next_check_at: actionLogPayload.feedback_loop.next_check_at,
                note: `Đã ghi action và đang chờ outcome sau ${FEEDBACK_LOOP_DELAY_HOURS} giờ để xác nhận feedback loop.`,
            },
        });

        // Trigger an immediate scan so new actions are not left waiting for the next scheduler tick.
        runAutonomousLearningCycle({ minActionAgeHours: FEEDBACK_LOOP_DELAY_HOURS }).catch((error) => {
            console.error("[Outcome] Immediate scan failed:", error.message);
        });
    }
}

module.exports = {
    orchestratorAgent,
    finalizeAction,
};
