const { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { systemPromptTemplate } = require("./prompt");
const { tools } = require("./tools");
const { getDb } = require("../config/mongodb");
const fbdb = require("../config/firebase");

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash", 
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  temperature: 0.2
});

const llmWithTools = llm.bindTools(tools);

const embeddings = new GoogleGenerativeAIEmbeddings({
  model: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

async function runAgent(sensorData) {
  const { salinity, moisture, crop_stage } = sensorData;
  const mongoDb = getDb();
  if (!mongoDb) {
    console.error("[Agent] MongoDB not connected. Skipping agent run.");
    await fbdb.ref("ai_status").update({ is_processing: false, last_reasoning: "Failed: Ext DB disconnected" });
    return;
  }

  // 1. Prepare Retrieval Query
  const queryText = `Salinity is ${salinity} ppt, moisture is ${moisture}%, stage is ${crop_stage}.`;
  
  let vectorHitCount = 0;
  let sourceIds = [];
  let contextDocs = [];
  let retrievalMiss = false;

  try {
     const queryVector = await embeddings.embedQuery(queryText);
     const cursor = mongoDb.collection("guideline_documents").aggregate([
       {
         "$vectorSearch": {
           "index": "vector_index",
           "path": "embedding",
           "queryVector": queryVector,
           "numCandidates": 10,
           "limit": parseInt(process.env.VECTOR_TOP_K || "3"),
           "filter": { "crop_stage": crop_stage || "VEGETATIVE" }
         }
       },
       { "$project": { "_id": 1, "title": 1, "content": 1, "score": { "$meta": "vectorSearchScore" } } }
     ]);

     const results = await cursor.toArray();
     
     const minScore = parseFloat(process.env.VECTOR_MIN_SCORE || "0.72");
     const validResults = results.filter(r => r.score >= minScore);
     
     if (validResults.length === 0) {
       retrievalMiss = true;
       contextDocs = ["No highly relevant agricultural guidelines found in database."];
       console.log("[RAG] Vector Search returned 0 documents (No Math Match or Index still building).");
     } else {
       validResults.forEach(doc => {
         sourceIds.push(doc._id);
         contextDocs.push(`[${doc._id}] ${doc.title}: ${doc.content}`);
       });
       vectorHitCount = validResults.length;
       console.log(`[RAG] 🔍 Vector Search successful! Found ${vectorHitCount} relevant guideline(s):`, sourceIds);
     }
  } catch (err) {
     console.error("[Agent] Vector Retrieval Error:", err.message);
     retrievalMiss = true;
     contextDocs = ["Vector Search failed."];
  }

  // 2. Build Prompt
  const prompt = systemPromptTemplate
    .replace("{salinity}", salinity)
    .replace("{moisture}", moisture)
    .replace("{crop_stage}", crop_stage)
    .replace("{context}", contextDocs.join("\n"));

  // 3. Execute Gemini
  const response = await llmWithTools.invoke([
    { role: "system", content: prompt },
    { role: "user", content: "Please evaluate the data and execute the correct tool." }
  ]);

  // 4. Parse Tool Call and execute
  let actionResult = {
      action: "NO_ACTION",
      reason: "Agent did not use tool.",
      blocked_by_manual: false
  };

  if (response.tool_calls && response.tool_calls.length > 0) {
      const toolCall = response.tool_calls[0];
      if (toolCall.name === "execute_valve_control") {
          const toolInstance = tools.find(t => t.name === toolCall.name);
          const rawToolOutput = await toolInstance.invoke(toolCall.args);
          const parsedOutput = JSON.parse(rawToolOutput);
          
          actionResult.action = parsedOutput.executed_state;
          actionResult.reason = parsedOutput.reason;
          actionResult.blocked_by_manual = parsedOutput.blocked_by_manual;
      }
  }

  // 5. Dual Logging
  if (!actionResult.blocked_by_manual && (actionResult.action === "OPEN" || actionResult.action === "CLOSED")) {
      await fbdb.ref("actuator/valve_state").set(actionResult.action);
  }

  await fbdb.ref("ai_status").update({
      is_processing: false,
      last_reasoning: actionResult.reason,
      last_retrieval_hit_count: vectorHitCount,
      last_retrieval_source_ids: sourceIds
  });

  const actionLogPayload = {
      timestamp: new Date().toISOString(),
      actor: "AI_AGENTIC",
      action: actionResult.action,
      reason: actionResult.reason + (actionResult.blocked_by_manual ? ' (BLOCKED BY MANUAL MODE)' : ''),
      retrieval: {
          hit_count: vectorHitCount,
          source_ids: sourceIds,
          retrieval_miss: retrievalMiss
      },
      sensor_snapshot: sensorData
  };

  await fbdb.ref("action_logs").push(actionLogPayload);

  if (mongoDb) {
      await mongoDb.collection("action_logs").insertOne(actionLogPayload);
  }

  console.log(`[Agent] Finished. Action: ${actionResult.action}. Reason: ${actionResult.reason}`);
}

module.exports = { runAgent };
