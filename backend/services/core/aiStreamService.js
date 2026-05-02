const listeners = new Set();

let currentSession = null;
let lastCompletedSession = null;
let sessionCounter = 0;

function createSnapshot(session) {
  if (!session) return null;

  return {
    id: session.id,
    status: session.status,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    finishedAt: session.finishedAt || null,
    triggerReason: session.triggerReason || "",
    sensorData: session.sensorData || {},
    currentPhase: session.currentPhase || "pipeline",
    currentMessage: session.currentMessage || "",
    reasoningByPhase: session.reasoningByPhase || {},
    finalAction: session.finalAction || null,
    error: session.error || null,
  };
}

function notify(event) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("[AI Stream] Listener error:", error.message);
    }
  }
}

function startAiStreamSession({ sensorData = {}, triggerReason = "" } = {}) {
  sessionCounter += 1;
  currentSession = {
    id: `ai-stream-${Date.now()}-${sessionCounter}`,
    status: "processing",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    triggerReason,
    sensorData,
    currentPhase: "pipeline",
    currentMessage: "Đang khởi động pipeline...",
    reasoningByPhase: {
      pipeline: "",
      retrieval: "",
      researcher: "",
      orchestrator: "",
    },
    finalAction: null,
    error: null,
    events: [],
  };

  const snapshot = createSnapshot(currentSession);
  const event = { type: "snapshot", payload: snapshot };
  currentSession.events.push(event);
  notify(event);
  return snapshot;
}

function ensureSession() {
  if (!currentSession) {
    startAiStreamSession();
  }
  return currentSession;
}

function appendStreamEvent(type, payload = {}) {
  const session = ensureSession();
  const event = {
    type,
    payload: {
      ...payload,
      sessionId: session.id,
      updatedAt: new Date().toISOString(),
    },
  };

  session.updatedAt = event.payload.updatedAt;
  if (payload.phase) {
    session.currentPhase = payload.phase;
  }
  if (typeof payload.message === "string") {
    session.currentMessage = payload.message;
  }
  if (type === "token" && payload.token) {
    const phase = payload.phase || session.currentPhase || "orchestrator";
    session.reasoningByPhase[phase] = `${session.reasoningByPhase[phase] || ""}${payload.token}`;
  }
  session.events.push(event);
  notify(event);
  return event;
}

function recordStatus(status, metadata = {}) {
  const session = ensureSession();
  session.status = status;
  if (metadata.phase) {
    session.currentPhase = metadata.phase;
  }
  if (typeof metadata.message === "string") {
    session.currentMessage = metadata.message;
  }
  if (status === "done" && metadata.finalAction) {
    session.finalAction = metadata.finalAction;
  }
  if (status === "error" && metadata.message) {
    session.error = metadata.message;
  }

  return appendStreamEvent("status", {
    ...metadata,
    status,
  });
}

function recordToken(token, phase = "orchestrator") {
  return appendStreamEvent("token", { token, phase });
}

function completeAiStreamSession(result = {}) {
  if (!currentSession) return null;

  currentSession.status = "done";
  currentSession.finishedAt = new Date().toISOString();
  currentSession.updatedAt = currentSession.finishedAt;
  if (result.action) {
    currentSession.finalAction = result.action;
  }
  if (result.reason) {
    currentSession.currentMessage = result.reason;
  }

  const snapshot = createSnapshot(currentSession);
  const event = {
    type: "complete",
    payload: {
      ...snapshot,
      ...result,
    },
  };
  currentSession.events.push(event);
  lastCompletedSession = snapshot;
  notify(event);
  notify({ type: "done", payload: { sessionId: currentSession.id, ...result } });
  return snapshot;
}

function failAiStreamSession(message = "Unknown error") {
  if (!currentSession) {
    startAiStreamSession();
  }

  currentSession.status = "error";
  currentSession.error = message;
  currentSession.finishedAt = new Date().toISOString();
  currentSession.updatedAt = currentSession.finishedAt;

  const snapshot = createSnapshot(currentSession);
  const event = {
    type: "error",
    payload: snapshot,
  };
  currentSession.events.push(event);
  lastCompletedSession = snapshot;
  notify(event);
  return snapshot;
}

function subscribeAiStream(listener, { replay = true } = {}) {
  listeners.add(listener);

  if (replay) {
    const session = currentSession || lastCompletedSession;
    if (session) {
      listener({ type: "snapshot", payload: createSnapshot(session) });
      if (currentSession && Array.isArray(currentSession.events)) {
        for (const event of currentSession.events) {
          listener(event);
        }
      }
    }
  }

  return () => {
    listeners.delete(listener);
  };
}

function getCurrentAiStream() {
  return createSnapshot(currentSession || lastCompletedSession);
}

module.exports = {
  startAiStreamSession,
  recordStatus,
  recordToken,
  completeAiStreamSession,
  failAiStreamSession,
  subscribeAiStream,
  getCurrentAiStream,
};