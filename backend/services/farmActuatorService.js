const db = require("../config/firebase");
const { CONTROL_MODES, VALVE_STATES } = require("./farmPayloadMapper");

function createValidationError(error, allowed) {
  const err = new Error(error);
  err.status = 400;
  err.payload = { error, allowed };
  return err;
}

async function setControlMode(controlModeInput) {
  const mode = String(controlModeInput || "").toUpperCase();
  if (!CONTROL_MODES.includes(mode)) {
    throw createValidationError("Invalid control_mode", CONTROL_MODES);
  }

  await db.ref("actuator/control_mode").set(mode);
  return { control_mode: mode };
}

async function overrideActuatorFields({ control_mode, valve_state }) {
  const updates = {};

  if (control_mode != null) {
    const mode = String(control_mode).toUpperCase();
    if (!CONTROL_MODES.includes(mode)) {
      throw createValidationError("Invalid control_mode", CONTROL_MODES);
    }
    updates.control_mode = mode;
  }

  if (valve_state != null) {
    const valve = String(valve_state).toUpperCase();
    if (!VALVE_STATES.includes(valve)) {
      throw createValidationError("Invalid valve_state", VALVE_STATES);
    }
    updates.valve_state = valve;
  }

  if (!Object.keys(updates).length) {
    throw createValidationError("No valid fields to update", undefined);
  }

  await db.ref("actuator").update(updates);

  if (updates.valve_state) {
    await db.ref("action_logs").push({
      timestamp: new Date().toISOString(),
      actor: "USER",
      action: updates.valve_state,
      reason: "Manual override from frontend dashboard",
    });
  }

  return updates;
}

module.exports = {
  setControlMode,
  overrideActuatorFields,
};
