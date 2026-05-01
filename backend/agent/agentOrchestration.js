const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatOpenAI } = require("@langchain/openai");
const { orchestratorTools } = require("./tools");
const fbdb = require("../config/firebase");
const { logActionWithPrediction, runAutonomousLearningCycle } = require("../services/ai/outcomeService");
const { toVietnamISOString, addHoursVietnamISOString } = require("../utils/vietnamTime");
const FEEDBACK_LOOP_DELAY_HOURS = Math.max(0, Number(process.env.OUTCOME_MIN_ACTION_AGE_HOURS || "1"));

function normalizeOrchestratorProvider() {
    return String(process.env.AI_PROVIDER || "gemini").toLowerCase().trim();
}

function createOrchestrationLLM() {
    const provider = normalizeOrchestratorProvider();
    const temperature = Number(process.env.LLM_TEMPERATURE || "0.2");

    // GLM-4.7 / FPT Cloud — primary Orchestration Agent
    if (provider === "glm4") {
        const apiKey = process.env.GLM4_API_KEY;
        const baseURL = process.env.GLM4_BASE_URL;
        const model = process.env.GLM4_MODEL || "GLM-4.7";
        if (!apiKey || !baseURL) throw new Error("Missing GLM4 config: GLM4_API_KEY and GLM4_BASE_URL are required");
        return new ChatOpenAI({ 
            model, 
            apiKey, 
            temperature, 
            streaming: true,
            configuration: { baseURL } 
        });
    }

    // SAOLA4_MEDIUM — kept for backward compatibility (now used as Feedback/Evaluator Agent)
    if (provider === "saola4_medium") {
        const apiKey = process.env.SAOLA4_MEDIUM_API_KEY;
        const baseURL = process.env.SAOLA4_MEDIUM_BASE_URL;
        const model = process.env.SAOLA4_MEDIUM_MODEL || "SaoLa4-medium";
        if (!apiKey || !baseURL) throw new Error("Missing SAOLA4_MEDIUM config");
        return new ChatOpenAI({ 
            model, 
            apiKey, 
            temperature, 
            streaming: true,
            configuration: { baseURL } 
        });
    }

    // Gemini — fallback provider
    return new ChatGoogleGenerativeAI({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        temperature,
    });
}

function getOrchestratorRuntimeInfo() {
    const provider = normalizeOrchestratorProvider();

    if (provider === "glm4") {
        return {
            provider,
            model: process.env.GLM4_MODEL || "GLM-4.7",
            streaming: true,
        };
    }

    if (provider === "saola4_medium") {
        return {
            provider,
            model: process.env.SAOLA4_MEDIUM_MODEL || "SaoLa4-medium",
            streaming: true,
        };
    }

    return {
        provider: "gemini",
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        streaming: false,
    };
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
    if (!actionResult) return;

    // 1. Fetch current valve state DIRECTLY from its node to ensure sync with hardware
    const valveStateSnap = await fbdb.ref("SalinAI/actuator/valve_state").once("value");
    const currentValveState = valveStateSnap.val() || "CLOSED";


    let finalState = actionResult.executed_state;
    let humanReason = actionResult.reason || "AI thực hiện hành động.";

    humanReason = humanReason
        .replace(/\bNO_ACTION\b/gi, "duy trì trạng thái")
        .replace(/\bOPEN\b/gi, "mở van")
        .replace(/\bCLOSED\b/gi, "đóng van")
        .replace(/\bACTUATOR\b/gi, "thiết bị")
        .replace(/\bVALVE\b/gi, "van");

    if (finalState === "NO_ACTION" || !finalState) {
        finalState = currentValveState;
        humanReason = `[DUY TRÌ: ${finalState === "OPEN" ? "MỞ" : "ĐÓNG"} VAN] ` + humanReason;
    } else if (finalState !== currentValveState) {
        humanReason = `[THỰC THI: ${finalState === "OPEN" ? "MỞ" : "ĐÓNG"} VAN] ` + humanReason;
    } else {
        humanReason = `[XÁC NHẬN: ${finalState === "OPEN" ? "MỞ" : "ĐÓNG"} VAN] ` + humanReason;
    }

    // 3. FORCE synchronization to ensure hardware and dashboard are always updated
    await fbdb.ref("SalinAI/actuator/valve_state").set(finalState);
    await fbdb.ref("SalinAI/control/action").set(finalState);


    const thresholds = actionResult.suggested_thresholds || { 
        salinity_delta: 0.1, 
        moisture_delta: 1.0, 
        recovery_salinity: 0.8,
        urgent_moisture: 30
    };
    
    // Đánh dấu nếu AI không tự đưa ra ngưỡng (để mình biết mà nhắc AI)
    const isAiManaged = !!actionResult.suggested_thresholds;
    const thresholdSummary = `${isAiManaged ? "⚙️ AI đề xuất ngưỡng" : "⚠️ Ngưỡng mặc định"}: Mặn > ${thresholds.salinity_delta}ppt | Ẩm > ${thresholds.moisture_delta}%`;

    const fullReason = humanReason + "\n\n" + thresholdSummary;

    await fbdb.ref("SalinAI/ai_status").update({
        is_processing: false,
        last_reasoning: fullReason,
        thresholds: thresholds,
        threshold_summary: thresholdSummary,
        threshold_ai_managed: isAiManaged
    });

    const actionTimestamp = toVietnamISOString();
    const actionLogPayload = {
        timestamp: actionTimestamp,
        actor,
        action: finalState,
        reason: fullReason,
        sensor_snapshot: sensorData,
        subagent_summary: researcherSummary,
        retrieval: {
            hit_count: finalHitCount || 0,
            source_ids: finalSourceIds || []
        },
        agent_trace: agentTrace,
        model_insights: modelInsights,
    };

    await fbdb.ref("SalinAI/action_logs").push(actionLogPayload);

    console.log(`\n+---------------- [QUYẾT ĐỊNH CỦA AI] (PID: ${process.pid}) ----------------+`);
    console.log(`| HÀNH ĐỘNG: [${finalState === "OPEN" ? "MỞ VAN" : "ĐÓNG VAN"}]`);
    console.log(`| LÝ DO: ${humanReason.substring(0, 70)}...`);
    console.log(`| LÁ CHẮN: ${thresholdSummary}`);
    console.log(`+-----------------------------------------------------------+\n`);

    if (mongoDb) {
        await logActionWithPrediction(actionLogPayload).catch(() => {});
        runAutonomousLearningCycle({ minActionAgeHours: FEEDBACK_LOOP_DELAY_HOURS }).catch(() => {});
    }
}

module.exports = { orchestratorAgent, finalizeAction, getOrchestratorRuntimeInfo };
