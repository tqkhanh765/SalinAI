/**
 * POLICY LEARNING SERVICE
 * 
 * Tác dụng: Lưu trữ phản hồi từ người dùng, xây dựng tóm tắt chính sách (Policy)
 * và quản lý các bài học kinh nghiệm để tiêm vào Prompt của Agent.
 */
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

function formatFeedbackCase(feedback) {
  const verdict = String(feedback?.verdict || "unknown").toUpperCase();
  const salinity = Number(feedback?.sensor_snapshot?.salinity || 0).toFixed(1);
  const moisture = Number(feedback?.sensor_snapshot?.moisture || 0).toFixed(1);
  const action = String(feedback?.action || "NO_ACTION").toUpperCase();
  const expected = feedback?.corrected_action ? String(feedback.corrected_action).toUpperCase() : "N/A";
  const notes = compactText(feedback?.notes || "", 120);
  const reason = compactText(feedback?.reason || "", 120);

  return {
    verdict,
    observed_action: action,
    expected_action: expected,
    sensor: { salinity_ppt: salinity, moisture_pct: moisture },
    reason,
    notes,
  };
}

async function getPolicySummary() {
  const mongoDb = getDb();
  if (!mongoDb) {
    return {
      summary: "No feedback-based policy memory yet (MongoDB offline).",
      stats: null,
      recent_feedback_cases: [],
      updatedAt: null,
    };
  }

  const doc = await mongoDb.collection("agent_policy_memory").findOne({ _id: POLICY_DOC_ID });
  if (!doc) {
    return {
      summary: "No operational feedback available yet.",
      stats: null,
      recent_feedback_cases: [],
      updatedAt: null,
    };
  }

  return {
    summary: doc.summary || "No operational feedback available yet.",
    stats: doc.stats || null,
    recent_feedback_cases: Array.isArray(doc.recent_feedback_cases) ? doc.recent_feedback_cases : [],
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
      recent_feedback_cases: [],
      updatedAt: emptyDoc.updated_at,
    };
  }

  const reviewed = feedbacks.length;
  const correct = feedbacks.filter((f) => f.verdict === "correct").length;
  const incorrect = feedbacks.filter((f) => f.verdict === "incorrect").length;
  const accuracy = reviewed > 0 ? Number(((correct / reviewed) * 100).toFixed(1)) : null;
  const recentCases = feedbacks.slice(0, 8).map((f) => formatFeedbackCase(f)); // New recent cases formatted

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
    recent_feedback_cases: recentCases,
    updated_at: new Date(),
  };

  await mongoDb
    .collection("agent_policy_memory")
    .updateOne({ _id: POLICY_DOC_ID }, { $set: policyDoc }, { upsert: true });

  return {
    summary,
    stats: policyDoc.stats,
    recent_feedback_cases: recentCases,
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
  const stats = policy?.stats || {};
  const cases = Array.isArray(policy?.recent_feedback_cases) ? policy.recent_feedback_cases : [];

  const caseLines = cases
    .map((item, idx) => {
      const notePart = item.notes ? ` | notes=${item.notes}` : "";
      const reasonPart = item.reason ? ` | reason=${item.reason}` : "";
      return `${idx + 1}. verdict=${item.verdict}; observed=${item.observed_action}; expected=${item.expected_action}; salinity=${item.sensor?.salinity_ppt}; moisture=${item.sensor?.moisture_pct}${reasonPart}${notePart}`;
    })
    .join("\n");

  const policyBlock = [
    "\n\n[POLICY_MEMORY]",
    `SUMMARY: ${policy.summary}`,
    `STATS: reviewed=${stats.reviewed ?? 0}, correct=${stats.correct ?? 0}, incorrect=${stats.incorrect ?? 0}, accuracy=${stats.accuracy ?? "N/A"}%`,
    "LEARNING RULE: Treat verdict=CORRECT as positive pattern; treat verdict=INCORRECT as pattern to avoid unless stronger safety evidence exists.",
    "RECENT_FEEDBACK_CASES:",
    caseLines || "none",
  ].join("\n");

  // Append RLHF lessons extracted by the Evaluator Agent (SAOLA4_MEDIUM)
  let rlhfBlock = "";
  try {
    const { buildRLHFMemoryBlock } = require("../../agent/agentEvaluator");
    rlhfBlock = await buildRLHFMemoryBlock(5);
  } catch (_) {
    // Non-fatal: RLHF lessons are supplementary context
  }

  return rlhfBlock ? `${policyBlock}\n\n${rlhfBlock}` : policyBlock;
}


module.exports = {
  normalizeVerdict,
  getPolicySummary,
  refreshPolicySummary,
  saveDecisionFeedback,
  buildPolicyPromptBlock,
};
