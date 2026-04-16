/**
 * Multi-agent AI runner.
 * Orchestrates the Researcher and Orchestrator phases, injects policy memory, and stores the final action trace.
 */
const { researcherPromptTemplate, orchestratorPromptTemplate } = require("./prompt");
const { getDb } = require("../config/mongodb");
const fbdb = require("../config/firebase");
const { researcherTools, orchestratorTools } = require("./tools");

// ─── Orchestration Utils & Services ────────────────────────────────────────────
const {
    isQuotaError,
    parseRetrySeconds,
    withTimeout,
} = require("../services/core/agentSafetyService");

const { executeRAGTool } = require("../services/ai/retrievalService");
const { researcherAgent } = require("./agentResearch");

const {
    orchestratorAgent,
    finalizeAction,
} = require("./agentOrchestration");
const { buildPolicyPromptBlock } = require("../services/ai/policyLearningService");

const MAX_RESEARCH_LOOPS = Math.max(3, parseInt(process.env.MAX_RESEARCH_LOOPS || "3", 10));
const MAX_ORCHESTRATION_LOOPS = Math.max(3, parseInt(process.env.MAX_ORCHESTRATION_LOOPS || "3", 10));
const AGENT_PHASE_TIMEOUT_MS = Math.max(3000, parseInt(process.env.AGENT_PHASE_TIMEOUT_MS || "12000", 10));
const MAX_TRACE_STEPS = Math.max(10, parseInt(process.env.AGENT_TRACE_MAX_STEPS || "40", 10));
const MAX_INSIGHT_CHARS = Math.max(200, parseInt(process.env.AGENT_INSIGHT_MAX_CHARS || "800", 10));
const MAX_RETRIEVAL_OUTPUT_CHARS = Math.max(400, parseInt(process.env.RETRIEVAL_OUTPUT_MAX_CHARS || "2200", 10));
const MAX_FULL_OUTPUT_CHARS = Math.max(2000, parseInt(process.env.MODEL_OUTPUT_MAX_CHARS || "12000", 10));

// ─── Pipeline Execution ──────────────────────────────────────────────────────
async function runAgent(sensorData) {
  const { salinity, moisture } = sensorData;
  const mongoDb = getDb();
    if (!mongoDb) {
    console.error("[Orchestrator] MongoDB is not connected.");
        await fbdb.ref("ai_status").update({
            is_processing: false,
            last_reasoning: "MongoDB is not connected. AI pipeline cannot run.",
        });
    return;
  }

    let finalHitCount = 0;
    let finalSourceIds = [];
    let researcherSummary = "";
    let actionResult = null;
    let researcherRawOutput = "";
    let orchestratorRawOutput = "";
    let retrievalOutputPreview = "";
    const agentTrace = [];

    const toText = (value) => {
        if (typeof value === "string") return value;
        if (Array.isArray(value)) {
            return value
                .map((item) => {
                    if (typeof item === "string") return item;
                    if (item?.text) return item.text;
                    if (item?.content) return item.content;
                    return "";
                })
                .filter(Boolean)
                .join("\n");
        }
        if (value == null) return "";
        return String(value);
    };

    const compactText = (value, maxLen = MAX_INSIGHT_CHARS) => {
        const normalized = String(value || "").replace(/\s+/g, " ").trim();
        if (!normalized) return "";
        return normalized.length > maxLen ? `${normalized.slice(0, maxLen)}...` : normalized;
    };

    const truncateText = (value, maxLen = MAX_FULL_OUTPUT_CHARS) => {
        const text = String(value || "").trim();
        if (!text) return "";
        return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
    };

    const parseDecisionFromText = (content) => {
        const text = toText(content);
        if (!text) return null;

        const safetyDecision = text.match(/(?:safety\s*decision)\s*:\s*(OPEN|CLOSED|NO_ACTION)/i);
        let state = safetyDecision ? safetyDecision[1].toUpperCase() : null;

        if (!state) {
            const explicitState = text.match(/\b(OPEN|CLOSED|NO_ACTION|CLOSE)\b/i);
            if (explicitState) {
                const token = explicitState[1].toUpperCase();
                state = token === "CLOSE" ? "CLOSED" : token;
            }
        }

        if (!state) return null;

        return {
            state,
            reason: compactText(text, 260),
        };
    };

    const addTrace = (phase, event, message, meta = {}) => {
        if (agentTrace.length >= MAX_TRACE_STEPS) {
            return;
        }
        agentTrace.push({
            timestamp: new Date().toISOString(),
            phase,
            event,
            message,
            meta,
        });
    };

    try {
        console.log("\n[Pipeline] 🚀 Starting multi-agent pipeline...");
        addTrace("pipeline", "start", "Multi-agent pipeline started", {
            sensor: { salinity, moisture },
        });

        const policyPromptBlock = await buildPolicyPromptBlock();
        addTrace("pipeline", "policy_memory", "Loaded policy memory for Orchestrator", {
            preview: compactText(policyPromptBlock, 220),
        });

        // 1. Phase 1: Researcher Subagent (Data Gathering)
        console.log("[Subagent] 🕵️ Researcher is analyzing guideline evidence...");
        const researcherMessages = [
            { role: "system", content: researcherPromptTemplate },
            { role: "user", content: `Current sensor data - Salinity: ${salinity} ppt, Moisture: ${moisture}%. Retrieve relevant guidelines and summarize clearly.` }
        ];

        let researchLoop = 0;
        while (researchLoop < MAX_RESEARCH_LOOPS) {
            researchLoop++;
            addTrace("researcher", "iteration", `Researcher loop ${researchLoop} started`);
            const response = await withTimeout(
                researcherAgent.invoke(researcherMessages),
                AGENT_PHASE_TIMEOUT_MS,
                "Researcher phase"
            );
            researcherMessages.push(response);
            researcherRawOutput = truncateText(toText(response?.content));

            if (!response.tool_calls || response.tool_calls.length === 0) {
                researcherSummary = response.content;
                addTrace("researcher", "summary", "Researcher produced final summary", {
                    preview: compactText(researcherSummary, 400),
                });
                console.log(`[Subagent] 📜 Researcher summary ready: "${researcherSummary.substring(0, 60)}..."`);
                break;
            }

            addTrace("researcher", "tool_calls", "Researcher requested tool calls", {
                tools: response.tool_calls.map((toolCall) => toolCall.name),
            });

            for (const toolCall of response.tool_calls) {
                if (toolCall.name === "search_agricultural_guidelines") {
                    const ragData = await executeRAGTool(toolCall.args.salinity, toolCall.args.moisture, mongoDb);
                    finalHitCount = ragData.hitCount;
                    finalSourceIds = ragData.sourceIds;
                    retrievalOutputPreview = truncateText(ragData.context, MAX_RETRIEVAL_OUTPUT_CHARS);
                    addTrace("retrieval", "rag_result", `Retrieved ${finalHitCount} guideline chunks`, {
                        source_ids: finalSourceIds,
                    });

                    researcherMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                        content: ragData.context
                    });
                    console.log(`[Subagent] 💾 Retrieved ${finalHitCount} RAG guideline chunks. Continuing analysis...`);
                } else if (toolCall.name === "query_action_history") {
                    const toolInstance = researcherTools.find(t => t.name === toolCall.name);
                    const historyLog = await toolInstance.invoke(toolCall.args);
                    addTrace("researcher", "history_lookup", "Loaded recent action history", {
                        limit: toolCall.args?.limit ?? 3,
                        preview: String(historyLog || "").slice(0, 220),
                    });
                    researcherMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                        content: historyLog
                    });
                    console.log(`[Subagent] 🕒 Recent AI action history loaded.`);
                }
            }
        }

        // 2. Phase 2: Orchestrator Agent (Decision & Actuation)
        console.log("[Orchestrator] 🧠 Orchestrator is reading researcher report + raw sensor data...");
        const orchestratorMessages = [
            { role: "system", content: `${orchestratorPromptTemplate}${policyPromptBlock}` },
            { role: "user", content: `Raw sensor data:\nSalinity: ${salinity} ppt, Moisture: ${moisture}%\n\nResearcher report:\n${researcherSummary}\n\nMake the final decision and call the valve control tool.` }
        ];

        let orchestrationLoop = 0;
        while (orchestrationLoop < MAX_ORCHESTRATION_LOOPS) {
            orchestrationLoop++;
            addTrace("orchestrator", "iteration", `Orchestrator loop ${orchestrationLoop} started`);
            const response = await withTimeout(
                orchestratorAgent.invoke(orchestratorMessages),
                AGENT_PHASE_TIMEOUT_MS,
                "Orchestrator phase"
            );
            orchestratorMessages.push(response);
            orchestratorRawOutput = truncateText(toText(response?.content));

            if (!response.tool_calls || response.tool_calls.length === 0) {
                const parsedDecision = parseDecisionFromText(response?.content);
                if (parsedDecision) {
                    const toolInstance = orchestratorTools.find(t => t.name === "execute_valve_control");
                    const rawOutput = await toolInstance.invoke({
                        state: parsedDecision.state,
                        reason: `Parsed from orchestrator text: ${parsedDecision.reason}`,
                        source_ids: (finalSourceIds || []).map((id) => String(id)),
                    });
                    actionResult = JSON.parse(rawOutput);
                    addTrace("orchestrator", "parsed_text_decision", "No tool_call returned; parsed decision from response text", {
                        state: actionResult.executed_state,
                    });
                    break;
                }

                addTrace("orchestrator", "no_tool_call", "Orchestrator returned no tool_call");
                break;
            }

            addTrace("orchestrator", "tool_calls", "Orchestrator requested tool calls", {
                tools: response.tool_calls.map((toolCall) => toolCall.name),
            });

            for (const toolCall of response.tool_calls) {
                if (toolCall.name === "execute_valve_control") {
                    console.log("[Orchestrator] ⚡ Sending hardware control command...");
                    const toolInstance = orchestratorTools.find(t => t.name === toolCall.name);
                    const rawOutput = await toolInstance.invoke(toolCall.args);
                    actionResult = JSON.parse(rawOutput);
                    addTrace("orchestrator", "decision", "Valve control tool executed", {
                        state: actionResult.executed_state,
                        blocked_by_manual: actionResult.blocked_by_manual,
                    });

                    orchestratorMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                        content: "Valve state updated."
                    });
                }
            }
            if (actionResult) break;
        }

        if (!actionResult) {
            const noActionError = new Error("Orchestrator did not return an executable valve action.");
            noActionError.code = "NO_TOOL_ACTION";
            addTrace("orchestrator", "error", "No valid valve action received from Orchestrator");
            throw noActionError;
        }

        await finalizeAction({
            actionResult,
            sensorData,
            finalHitCount,
            finalSourceIds,
            researcherSummary,
            actor: "ORCHESTRATOR_AGENT",
            mongoDb,
            agentTrace,
            modelInsights: {
                researcher_output_preview: researcherRawOutput,
                orchestrator_output_preview: orchestratorRawOutput,
                retrieval_output_preview: retrievalOutputPreview,
                researcher_provider: String(process.env.RESEARCHER_PROVIDER || process.env.AI_PROVIDER || "gemini").toLowerCase(),
                researcher_model: process.env.RESEARCHER_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
                orchestrator_provider: String(process.env.AI_PROVIDER || "gemini").toLowerCase(),
                orchestrator_model: String(process.env.AI_PROVIDER || "gemini").toLowerCase() === "saola"
                    ? (process.env.SAOLA_MODEL || "saola-chat")
                    : (process.env.GEMINI_MODEL || "gemini-2.5-flash"),
            },
        });

        console.log(`[Orchestrator] ✅ Final action: ${actionResult.executed_state} | Reason: ${actionResult.reason}`);
    } catch (err) {
        if (isQuotaError(err)) {
            const retrySeconds = parseRetrySeconds(err);
            const retryHint = retrySeconds ? ` Retry after ~${retrySeconds}s.` : "";
            err.message = `Model quota exceeded.${retryHint}`;
            err.code = err.code || "MODEL_QUOTA";
        }

        if (err?.code === "AGENT_TIMEOUT") {
            err.message = `${err.message}. No fallback applied.`;
        }

        addTrace("pipeline", "error", err.message, {
            code: err.code || "UNKNOWN_ERROR",
        });

        await fbdb.ref("ai_status").update({
            is_processing: false,
            last_reasoning: `AI pipeline error: ${err.message}`,
        });

        throw err;
    }
}

module.exports = { runAgent };
