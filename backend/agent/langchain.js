const { researcherPromptTemplate, orchestratorPromptTemplate } = require("./prompt");
const { getDb } = require("../config/mongodb");
const fbdb = require("../config/firebase");
const { researcherTools, orchestratorTools } = require("./tools");

// ─── Orchestration Utils & Services ────────────────────────────────────────────
const {
    isQuotaError,
    parseRetrySeconds,
    withTimeout,
    buildFallbackAction,
} = require("../services/core/agentSafetyService");

const { executeRAGTool } = require("./agentRetrieval");
const { researcherAgent } = require("./researcherAgent");

const {
    orchestratorAgent,
    finalizeAction,
} = require("./agentOrchestration");

const MAX_RESEARCH_LOOPS = Math.max(3, parseInt(process.env.MAX_RESEARCH_LOOPS || "3", 10));
const MAX_ORCHESTRATION_LOOPS = Math.max(3, parseInt(process.env.MAX_ORCHESTRATION_LOOPS || "3", 10));
const AGENT_PHASE_TIMEOUT_MS = Math.max(3000, parseInt(process.env.AGENT_PHASE_TIMEOUT_MS || "12000", 10));

// ─── Pipeline Execution ──────────────────────────────────────────────────────
async function runAgent(sensorData) {
  const { salinity, moisture } = sensorData;
  const mongoDb = getDb();
  if (!mongoDb) {
    console.error("[Orchestrator] MongoDB not connected.");
        await fbdb.ref("ai_status").update({
            is_processing: false,
            last_reasoning: "MongoDB not connected. Fallback unavailable.",
        });
    return;
  }

    let finalHitCount = 0;
    let finalSourceIds = [];
    let researcherSummary = "";
    let actionResult = null;

    try {
        console.log("\n[Pipeline] 🚀 Starting Multi-Agent Orchestration Workflow...");

        // 1. Phase 1: Researcher Subagent (Data Gathering)
        console.log("[Subagent] 🕵️ Researcher Subagent analyzing rules...");
        const researcherMessages = [
            { role: "system", content: researcherPromptTemplate },
            { role: "user", content: `Farm current data - Salinity: ${salinity} ppt, Moisture: ${moisture}%. Find the rules and summarize them!` }
        ];

        let researchLoop = 0;
        while (researchLoop < MAX_RESEARCH_LOOPS) {
            researchLoop++;
            const response = await withTimeout(
                researcherAgent.invoke(researcherMessages),
                AGENT_PHASE_TIMEOUT_MS,
                "Researcher phase"
            );
            researcherMessages.push(response);

            if (!response.tool_calls || response.tool_calls.length === 0) {
                researcherSummary = response.content;
                console.log(`[Subagent] 📜 Researcher Summary Created: "${researcherSummary.substring(0, 60)}..."`);
                break;
            }

            for (const toolCall of response.tool_calls) {
                if (toolCall.name === "search_agricultural_guidelines") {
                    const ragData = await executeRAGTool(toolCall.args.salinity, toolCall.args.moisture, mongoDb);
                    finalHitCount = ragData.hitCount;
                    finalSourceIds = ragData.sourceIds;

                    researcherMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                        content: ragData.context
                    });
                    console.log(`[Subagent] 💾 Found ${finalHitCount} RAG Guidelines. Analyzing...`);
                } else if (toolCall.name === "query_action_history") {
                    const toolInstance = researcherTools.find(t => t.name === toolCall.name);
                    const historyLog = await toolInstance.invoke(toolCall.args);
                    researcherMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                        content: historyLog
                    });
                    console.log(`[Subagent] 🕒 Checked AI memory logs for past actions.`);
                }
            }
        }

        // 2. Phase 2: Orchestrator Agent (Decision & Actuation)
        console.log("[Orchestrator] 🧠 Orchestrator Agent reviewing Subagent Report & Raw Sensor Data...");
        const orchestratorMessages = [
            { role: "system", content: orchestratorPromptTemplate },
            { role: "user", content: `Raw Sensor Data:\nSalinity: ${salinity} ppt, Moisture: ${moisture}%\n\nResearcher Subagent Report:\n${researcherSummary}\n\nPlease make a final decision and execute the physical valve tool.` }
        ];

        let orchestrationLoop = 0;
        while (orchestrationLoop < MAX_ORCHESTRATION_LOOPS) {
            orchestrationLoop++;
            const response = await withTimeout(
                orchestratorAgent.invoke(orchestratorMessages),
                AGENT_PHASE_TIMEOUT_MS,
                "Orchestrator phase"
            );
            orchestratorMessages.push(response);

            if (!response.tool_calls || response.tool_calls.length === 0) {
                break;
            }

            for (const toolCall of response.tool_calls) {
                if (toolCall.name === "execute_valve_control") {
                    console.log("[Orchestrator] ⚡ Orchestrator commanding hardware...");
                    const toolInstance = orchestratorTools.find(t => t.name === toolCall.name);
                    const rawOutput = await toolInstance.invoke(toolCall.args);
                    actionResult = JSON.parse(rawOutput);

                    orchestratorMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                        content: "Valve physically updated."
                    });
                }
            }
            if (actionResult) break;
        }

        if (!actionResult) {
            actionResult = await buildFallbackAction(
                sensorData,
                `No LLM tool action returned. Applied fallback safety rule (close if salinity >= 2.0).`
            );
            console.warn("[Fallback] No action from orchestrator. Applied deterministic fallback.");
        }

        await finalizeAction({
            actionResult,
            sensorData,
            finalHitCount,
            finalSourceIds,
            researcherSummary,
            actor: "ORCHESTRATOR_AGENT",
            mongoDb,
        });

        console.log(`[Orchestrator] ✅ Final Action: ${actionResult.executed_state} | Reason: ${actionResult.reason}`);
    } catch (err) {
        if (isQuotaError(err)) {
            const retrySeconds = parseRetrySeconds(err);
            const retryHint = retrySeconds ? ` Retry after ~${retrySeconds}s.` : "";
            const fallbackReason = `Gemini quota exceeded. Applied fallback safety rule (close if salinity >= 2.0).${retryHint}`;
            console.warn(`[Fallback] ${fallbackReason}`);

            const fallbackAction = await buildFallbackAction(sensorData, fallbackReason);

            await finalizeAction({
                actionResult: fallbackAction,
                sensorData,
                finalHitCount,
                finalSourceIds,
                researcherSummary: researcherSummary || "Fallback mode: LLM quota exceeded.",
                actor: "FALLBACK_RULE_ENGINE",
                mongoDb,
            });

            return;
        }

        if (err?.code === "AGENT_TIMEOUT") {
            const fallbackReason = `${err.message}. Applied fallback safety rule (close if salinity >= 2.0).`;
            console.warn(`[Fallback] ${fallbackReason}`);

            const fallbackAction = await buildFallbackAction(sensorData, fallbackReason);

            await finalizeAction({
                actionResult: fallbackAction,
                sensorData,
                finalHitCount,
                finalSourceIds,
                researcherSummary: researcherSummary || "Fallback mode: agent phase timed out.",
                actor: "FALLBACK_RULE_ENGINE",
                mongoDb,
            });

            return;
        }

        await fbdb.ref("ai_status").update({
            is_processing: false,
            last_reasoning: `Agent pipeline failed: ${err.message}`,
        });

        throw err;
    }
}

module.exports = { runAgent };
