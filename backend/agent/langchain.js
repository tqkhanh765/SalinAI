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

// ─── Pipeline Execution ──────────────────────────────────────────────────────
async function runAgent(sensorData) {
  const { salinity, moisture } = sensorData;
  const mongoDb = getDb();
  if (!mongoDb) {
    console.error("[Orchestrator] MongoDB not connected.");
    return;
  }

  console.log("\n[Pipeline] 🚀 Starting Multi-Agent Orchestration Workflow...");

  // 1. Phase 1: Researcher Subagent (Data Gathering)
  console.log("[Subagent] 🕵️ Researcher Subagent analyzing rules...");
  const researcherMessages = [
    { role: "system", content: researcherPromptTemplate },
    { role: "user", content: `Farm current data - Salinity: ${salinity} ppt, Moisture: ${moisture}%. Find the rules and summarize them!` }
  ];

  let finalHitCount = 0;
  let finalSourceIds = [];
  let researcherSummary = "";

  // Researcher Reasoning Loop
  let researchLoop = 0;
  while (researchLoop < 3) {
      researchLoop++;
      const response = await researcherAgent.invoke(researcherMessages);
      researcherMessages.push(response);

      if (!response.tool_calls || response.tool_calls.length === 0) {
          researcherSummary = response.content;
          console.log(`[Subagent] 📜 Researcher Summary Created: "${researcherSummary.substring(0, 60)}..."`);
          break; // Researcher is done!
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

  let actionResult = null;

  // Orchestrator Reasoning Loop
  let orchestrationLoop = 0;
  while (orchestrationLoop < 3) {
      orchestrationLoop++;
      const response = await orchestratorAgent.invoke(orchestratorMessages);
      orchestratorMessages.push(response);

      if (!response.tool_calls || response.tool_calls.length === 0) {
          break; // Ended without tool
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

  // 3. Dual Logging Process
  if (actionResult) {
      if (!actionResult.blocked_by_manual && (actionResult.executed_state === "OPEN" || actionResult.executed_state === "CLOSED")) {
          await fbdb.ref("actuator/valve_state").set(actionResult.executed_state);
      }

      await fbdb.ref("ai_status").update({
          is_processing: false,
          last_reasoning: actionResult.reason,
          last_retrieval_hit_count: finalHitCount,
          last_retrieval_source_ids: finalSourceIds
      });

      const actionLogPayload = {
          timestamp: new Date().toISOString(),
          actor: "ORCHESTRATOR_AGENT",
          action: actionResult.executed_state,
          reason: actionResult.reason + (actionResult.blocked_by_manual ? ' (BLOCKED BY MANUAL MODE)' : ''),
          retrieval: {
              hit_count: finalHitCount,
              source_ids: finalSourceIds,
              retrieval_miss: finalHitCount === 0
          },
          sensor_snapshot: sensorData,
          subagent_summary: researcherSummary
      };

      await fbdb.ref("action_logs").push(actionLogPayload);

      if (mongoDb) {
          await mongoDb.collection("action_logs").insertOne(actionLogPayload);
      }

      console.log(`[Orchestrator] ✅ Final Action: ${actionResult.executed_state} | Reason: ${actionResult.reason}`);
  }
}

module.exports = { runAgent };
