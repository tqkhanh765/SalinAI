const { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { researcherPromptTemplate, orchestratorPromptTemplate } = require("./prompt");
const { researcherTools, orchestratorTools } = require("./tools");
const { getDb } = require("../config/mongodb");
const fbdb = require("../config/firebase");

// ─── AI Models Initialization ──────────────────────────────────────────────────
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash", 
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  temperature: 0.2
});

const embeddings = new GoogleGenerativeAIEmbeddings({
  model: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

// Bind tools to separate agent personas
const researcherAgent = llm.bindTools(researcherTools);
const orchestratorAgent = llm.bindTools(orchestratorTools);

const MAX_RESEARCH_LOOPS = Math.max(1, parseInt(process.env.MAX_RESEARCH_LOOPS || "1", 10));
const MAX_ORCHESTRATION_LOOPS = Math.max(1, parseInt(process.env.MAX_ORCHESTRATION_LOOPS || "1", 10));
const AGENT_PHASE_TIMEOUT_MS = Math.max(3000, parseInt(process.env.AGENT_PHASE_TIMEOUT_MS || "12000", 10));

// ─── RAG Tool Logic ──────────────────────────────────────────────────────────
async function executeRAGTool(salinity, moisture, mongoDb) {
    const queryText = `Salinity is ${salinity} ppt, moisture is ${moisture}%.`;
    try {
        const queryVector = await embeddings.embedQuery(queryText);
        const cursor = mongoDb.collection("guideline_documents").aggregate([
          {
            "$vectorSearch": {
              "index": "vector_index",
              "path": "embedding",
              "queryVector": queryVector,
              "numCandidates": 10,
              "limit": parseInt(process.env.VECTOR_TOP_K || "3")
            }
          },
          { "$project": { "_id": 1, "title": 1, "content": 1, "score": { "$meta": "vectorSearchScore" } } }
        ]);
        const results = await cursor.toArray();
        const minScore = parseFloat(process.env.VECTOR_MIN_SCORE || "0.72");
        const validResults = results.filter(r => r.score >= minScore);
        
        if (validResults.length === 0) {
            return { hitCount: 0, sourceIds: [], context: "No guidelines found via search." };
        }
        
        let sourceIds = [];
        let contextDocs = [];
        validResults.forEach(doc => {
            sourceIds.push(doc._id);
            contextDocs.push(`[${doc._id}] ${doc.title}: ${doc.content}`);
        });
        
        return { hitCount: validResults.length, sourceIds, context: contextDocs.join("\n\n") };
    } catch (err) {
        console.error("Vector Retrieval Error:", err);
        return { hitCount: 0, sourceIds: [], context: "Vector Search offline." };
    }
}

function isQuotaError(err) {
    const status = err?.status;
    const text = String(err?.message || "").toLowerCase();
    return status === 429 || text.includes("quota") || text.includes("too many requests");
}

function parseRetrySeconds(err) {
    const details = err?.errorDetails || [];
    const retryInfo = details.find((d) => d?.["@type"]?.includes("RetryInfo"));
    const retryDelay = retryInfo?.retryDelay;
    if (typeof retryDelay === "string") {
        const parsed = parseInt(retryDelay.replace("s", ""), 10);
        if (Number.isFinite(parsed)) return parsed;
    }

    const message = String(err?.message || "");
    const match = message.match(/retry in\s+([\d.]+)s/i);
    if (match) {
        const parsed = Math.ceil(Number(match[1]));
        if (Number.isFinite(parsed)) return parsed;
    }

    return null;
}

async function withTimeout(promise, timeoutMs, label) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const error = new Error(`${label} timed out after ${timeoutMs}ms`);
            error.code = "AGENT_TIMEOUT";
            reject(error);
        }, timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeoutId);
    }
}

async function buildFallbackAction(sensorData, reason) {
    const salinity = Number(sensorData?.salinity || 0);
    const desiredState = salinity >= 2 ? "CLOSED" : "OPEN";
    const actuatorSnap = await fbdb.ref("actuator").once("value");
    const actuator = actuatorSnap.val() || {};
    const blockedByManual = actuator.control_mode === "MANUAL";

    return {
        executed_state: desiredState,
        reason,
        source_ids: [],
        blocked_by_manual: blockedByManual,
    };
}

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
