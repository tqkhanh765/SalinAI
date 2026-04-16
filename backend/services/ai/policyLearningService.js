const { getDb } = require("../../config/mongodb");

const POLICY_DOC_ID = "active";
const MAX_RECENT_FEEDBACK = Math.max(10, parseInt(process.env.POLICY_FEEDBACK_WINDOW || "40", 10));

function normalizeVerdict(verdict) {
  const v = String(verdict || "").trim().toLowerCase();
  if (v === "correct" || v === "good" || v === "pass") return "correct";
  if (v === "incorrect" || v === "bad" || v === "fail") return "incorrect";
  return null;
}

function compactText(text, maxLen = 180) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen)}...` : normalized;
}

async function getPolicySummary() {
  const mongoDb = getDb();
  if (!mongoDb) {
    return {
      summary: "No feedback-based policy memory yet (MongoDB offline).",
      stats: null,
      updatedAt: null,
    };
  }

  const doc = await mongoDb.collection("agent_policy_memory").findOne({ _id: POLICY_DOC_ID });
  if (!doc) {
    return {
      summary: "No operational feedback available yet.",
      stats: null,
      updatedAt: null,
    };
  }

  return {
    summary: doc.summary || "No operational feedback available yet.",
    stats: doc.stats || null,
    updatedAt: doc.updated_at || null,
  };
}

async function refreshPolicySummary() {
  const mongoDb = getDb();
  if (!mongoDb) {
    return {
      summary: "No feedback-based policy memory yet (MongoDB offline).",
      stats: null,
      updatedAt: null,
    };
  }

  const feedbacks = await mongoDb
    .collection("decision_feedback")
    .find({})
    .sort({ created_at: -1 })
    .limit(MAX_RECENT_FEEDBACK)
    .toArray();

  if (!feedbacks.length) {
    const emptyDoc = {
      _id: POLICY_DOC_ID,
      summary: "No operational feedback available yet.",
      stats: {
        reviewed: 0,
        correct: 0,
        incorrect: 0,
        accuracy: null,
      },
      lessons: [],
      updated_at: new Date(),
    };

    await mongoDb
      .collection("agent_policy_memory")
      .updateOne({ _id: POLICY_DOC_ID }, { $set: emptyDoc }, { upsert: true });

    return {
      summary: emptyDoc.summary,
      stats: emptyDoc.stats,
      updatedAt: emptyDoc.updated_at,
    };
  }

  const reviewed = feedbacks.length;
  const correct = feedbacks.filter((f) => f.verdict === "correct").length;
  const incorrect = feedbacks.filter((f) => f.verdict === "incorrect").length;
  const accuracy = reviewed > 0 ? Number(((correct / reviewed) * 100).toFixed(1)) : null;

  const negativeLessons = feedbacks
    .filter((f) => f.verdict === "incorrect")
    .slice(0, 5)
    .map((f) => {
      const salinity = Number(f.sensor_snapshot?.salinity || 0).toFixed(1);
      const moisture = Number(f.sensor_snapshot?.moisture || 0).toFixed(1);
      const action = String(f.action || "NO_ACTION").toUpperCase();
      const correction = f.corrected_action ? ` | expected: ${String(f.corrected_action).toUpperCase()}` : "";
      const notes = compactText(f.notes || "", 140);
      return `- Incorrect case at salinity ${salinity} ppt, moisture ${moisture}% with decision ${action}${correction}${notes ? ` | notes: ${notes}` : ""}`;
    });

  const summaryLines = [
    `Recent performance: ${correct}/${reviewed} reviewed cases were correct (${accuracy}%).`,
    incorrect > 0
      ? `Avoid repeating the ${incorrect} most recent incorrect cases; for similar conditions, act more conservatively and follow guideline evidence.`
      : "No recent incorrect cases detected; continue following guideline evidence and safety constraints.",
  ];

  if (negativeLessons.length > 0) {
    summaryLines.push("Lessons from recent feedback:");
    summaryLines.push(...negativeLessons);
  }

  const summary = summaryLines.join("\n");
  const policyDoc = {
    _id: POLICY_DOC_ID,
    summary,
    stats: {
      reviewed,
      correct,
      incorrect,
      accuracy,
    },
    lessons: negativeLessons,
    updated_at: new Date(),
  };

  await mongoDb
    .collection("agent_policy_memory")
    .updateOne({ _id: POLICY_DOC_ID }, { $set: policyDoc }, { upsert: true });

  return {
    summary,
    stats: policyDoc.stats,
    updatedAt: policyDoc.updated_at,
  };
}

async function saveDecisionFeedback(payload = {}) {
  const mongoDb = getDb();
  if (!mongoDb) {
    throw new Error("MongoDB is offline; cannot store feedback.");
  }

  const normalizedVerdict = normalizeVerdict(payload.verdict);
  if (!normalizedVerdict) {
    throw new Error("verdict must be either correct or incorrect.");
  }

  const feedbackDoc = {
    action_log_id: String(payload.action_log_id || "").trim(),
    verdict: normalizedVerdict,
    notes: String(payload.notes || "").trim(),
    corrected_action: payload.corrected_action ? String(payload.corrected_action).toUpperCase() : null,
    action: payload.action ? String(payload.action).toUpperCase() : null,
    reason: String(payload.reason || "").trim(),
    sensor_snapshot: payload.sensor_snapshot || {},
    source_ids: Array.isArray(payload.source_ids) ? payload.source_ids : [],
    created_at: new Date(),
  };

  if (!feedbackDoc.action_log_id) {
    throw new Error("action_log_id is required.");
  }

  const insertResult = await mongoDb.collection("decision_feedback").insertOne(feedbackDoc);
  const policy = await refreshPolicySummary();

  return {
    feedbackId: insertResult.insertedId,
    policy,
  };
}

async function buildPolicyPromptBlock() {
  const policy = await getPolicySummary();
  return `\n\n[POLICY_MEMORY]\n${policy.summary}`;
}

module.exports = {
  normalizeVerdict,
  getPolicySummary,
  refreshPolicySummary,
  saveDecisionFeedback,
  buildPolicyPromptBlock,
};
