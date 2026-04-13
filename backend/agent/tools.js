const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const db = require("../config/firebase");

const execute_valve_control = new DynamicStructuredTool({
  name: "execute_valve_control",
  description: "Executes a valve state change or records no action. Call this tool as your final step ALWAYS.",
  schema: z.object({
    state: z.enum(["OPEN", "CLOSED", "NO_ACTION"]),
    reason: z.string(),
    source_ids: z.array(z.string())
  }),
  func: async ({ state, reason, source_ids }) => {
    // Re-verify control_mode before any write
    const actuatorSnap = await db.ref("actuator").once("value");
    const actuator = actuatorSnap.val() || {};
    
    return JSON.stringify({ 
      executed_state: state, 
      reason, 
      source_ids, 
      blocked_by_manual: actuator.control_mode === "MANUAL" 
    });
  }
});

module.exports = { tools: [execute_valve_control] };
