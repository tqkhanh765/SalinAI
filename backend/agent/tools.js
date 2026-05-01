const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const fbdb = require("../config/firebase");
const { getDb } = require("../config/mongodb");

// ─── Researcher Subagent Tools ───────────────────────────────────────────
const search_agricultural_guidelines = new DynamicStructuredTool({
  name: "search_agricultural_guidelines",
  description: "Searches the MongoDB RAG database for agricultural safety rules based on a natural language query.",
  schema: z.object({ query: z.string().describe("Câu truy vấn tự nhiên tiếng Việt") }),
  func: async ({ query }) => { return "Execute vector search for: " + query; } // Intercepted in loop
});

const query_action_history = new DynamicStructuredTool({
  name: "query_action_history",
  description: "Reads the historical MongoDB action logs to see what the AI decided recently and learn from past actions.",
  schema: z.object({ limit: z.number().default(3) }),
  func: async ({ limit }) => {
    const mongoDb = getDb();
    if (!mongoDb) return "History unavailable. MongoDB disconnected.";
    try {
        const logs = await mongoDb.collection("action_logs")
           .find({})
           .sort({ timestamp: -1 })
           .limit(limit)
           .toArray();
        if (logs.length === 0) return "No past actions found.";
        return JSON.stringify(logs.map(l => `[${l.timestamp}] Action: ${l.action} | Reason: ${l.reason}`));
    } catch (err) {
        return "Failed to fetch history: " + err.message;
    }
  }
});

// ─── Orchestrator Agent Tools ───────────────────────────────────────────
const execute_valve_control = new DynamicStructuredTool({
  name: "execute_valve_control",
  description: "Executes a valve state change based on the Subagent's summary. Call this tool as your final step ALWAYS.",
  schema: z.object({
    state: z.enum(["OPEN", "CLOSED", "NO_ACTION"]),
    reason: z.string(),
    source_ids: z.array(z.string()),
    suggested_thresholds: z.object({
      salinity_delta: z.number().default(0.1).describe("Delta mặn cho lần tới (vd: 0.05)"),
      moisture_delta: z.number().default(1.0).describe("Delta ẩm cho lần tới (vd: 5.0)"),
      recovery_salinity: z.number().nullable().default(0.8).describe("Mức mặn an toàn để mở lại"),
      urgent_moisture: z.number().nullable().default(30.0).describe("Mức ẩm tối thiểu cứu cây")
    }).default({ salinity_delta: 0.1, moisture_delta: 1.0, recovery_salinity: 0.8, urgent_moisture: 30.0 })
      .describe("BẮT BUỘC: Tính toán ngưỡng cho lần sau dựa trên rủi ro hiện tại")
  }),
  func: async ({ state, reason, source_ids, suggested_thresholds }) => {
    const actuatorSnap = await fbdb.ref("SalinAI/actuator").once("value");
    const actuator = actuatorSnap.val() || {};
    return JSON.stringify({ 
      executed_state: state, 
      reason, 
      source_ids, 
      suggested_thresholds,
      blocked_by_manual: actuator.control_mode === "MANUAL" 
    });
  }
});

module.exports = { 
    researcherTools: [search_agricultural_guidelines, query_action_history],
    orchestratorTools: [execute_valve_control]
};
