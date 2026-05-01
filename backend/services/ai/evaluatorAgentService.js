/**
 * Evaluator Agent Service — Feedback Loop (RLHF)
 *
 * Provider: SAOLA4_MEDIUM (FPT Cloud)
 * Role: Triggered when a farmer submits negative (👎) feedback on an AI decision.
 *       Analyzes the mistake, extracts a structured lesson, and persists it to
 *       MongoDB `lessons_learned` for injection into future Orchestrator prompts.
 */
const { ChatOpenAI } = require("@langchain/openai");
const { getDb } = require("../../config/mongodb");
const { toVietnamISOString } = require("../../utils/vietnamTime");
const { evaluatorSystemPrompt } = require("../../agent/prompt");

// ─── Evaluator LLM (SAOLA4_MEDIUM) ──────────────────────────────────────────

function createEvaluatorLLM() {
    const provider = String(process.env.FEEDBACK_AGENT_PROVIDER || "saola4_medium").toLowerCase().trim();

    if (provider === "saola4_medium") {
        const apiKey = process.env.SAOLA4_MEDIUM_API_KEY;
        const baseURL = process.env.SAOLA4_MEDIUM_BASE_URL;
        const model = process.env.SAOLA4_MEDIUM_MODEL || "SaoLa4-medium";
        if (!apiKey || !baseURL) {
            throw new Error("Evaluator Agent requires SAOLA4_MEDIUM_API_KEY and SAOLA4_MEDIUM_BASE_URL");
        }
        return new ChatOpenAI({
            model,
            apiKey,
            temperature: 0.1, // Low temperature for consistent lesson extraction
            configuration: { baseURL },
        });
    }

    // Fallback: Gemini if FEEDBACK_AGENT_PROVIDER is overridden
    const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
    return new ChatGoogleGenerativeAI({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        temperature: 0.1,
    });
}



/**
 * Runs the Evaluator Agent on a negative-feedback action log.
 *
 * @param {Object} params
 * @param {string} params.action_log_id   - Firebase push key of the action log
 * @param {Object} params.action_log      - Full action log document
 * @param {string} params.verdict         - "incorrect" (only negative feedback triggers evaluator)
 * @param {string} params.notes           - Farmer's free-text reason for rejection
 * @returns {Promise<Object>}             - The saved lesson document
 */
async function runEvaluatorAgent({ action_log_id, action_log, verdict, notes }) {
    if (verdict !== "incorrect") {
        console.log("[Evaluator] Verdict is not 'incorrect'; skipping lesson extraction.");
        return null;
    }

    const mongoDb = getDb();
    if (!mongoDb) {
        throw new Error("[Evaluator] MongoDB not connected.");
    }

    const llm = createEvaluatorLLM();

    // Build context for the evaluator
    const sensorSnapshot = action_log?.sensor_snapshot || {};
    const aiAction = action_log?.action || "UNKNOWN";
    const aiReason = action_log?.reason || "No reason recorded.";
    const researcherSummary = action_log?.subagent_summary || "No researcher summary available.";
    const actionTimestamp = action_log?.timestamp || "Unknown time";

    const userMessage = `Thời điểm quyết định: ${actionTimestamp}

Dữ liệu cảm biến lúc AI ra quyết định:
- Độ mặn: ${sensorSnapshot.salinity ?? "N/A"} ppt
- Độ ẩm đất: ${sensorSnapshot.moisture ?? "N/A"}%
- Giai đoạn cây: ${sensorSnapshot.crop_stage ?? "N/A"}
- Thời tiết: ${JSON.stringify(sensorSnapshot.weather ?? {})}

Hành động AI đã thực thi: ${aiAction}

Lý do AI đưa ra: ${aiReason.substring(0, 500)}

Tóm tắt phân tích của Researcher (bối cảnh bằng chứng):
${researcherSummary.substring(0, 800)}

Phản hồi từ nông dân (lý do đánh dấu sai):
"${notes}"

Hãy phân tích và trả về JSON bài học theo đúng format yêu cầu.`;

    console.log(`[Evaluator] 🔍 Phân tích quyết định sai: action_log_id=${action_log_id}, action=${aiAction}`);

    let lessonData;
    try {
        const response = await llm.invoke([
            { role: "system", content: evaluatorSystemPrompt },
            { role: "user", content: userMessage },
        ]);

        const rawContent = String(response?.content || "").trim();

        // Extract JSON from response (handle markdown code blocks if present)
        const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/) || rawContent.match(/(\{[\s\S]*\})/);
        const jsonString = jsonMatch ? jsonMatch[1].trim() : rawContent;

        lessonData = JSON.parse(jsonString);
    } catch (parseErr) {
        console.error("[Evaluator] Failed to parse LLM response as JSON:", parseErr.message);
        throw new Error(`Evaluator Agent produced invalid JSON: ${parseErr.message}`);
    }

    // Validate required fields
    const requiredFields = ["condition_pattern", "action_taken", "correct_action", "lesson_text"];
    for (const field of requiredFields) {
        if (!lessonData[field]) {
            throw new Error(`Evaluator Agent response missing required field: '${field}'`);
        }
    }

    // Persist to MongoDB lessons_learned
    const lessonDocument = {
        action_log_id: String(action_log_id),
        condition_pattern: String(lessonData.condition_pattern),
        action_taken: String(lessonData.action_taken).toUpperCase(),
        correct_action: String(lessonData.correct_action).toUpperCase(),
        lesson_text: String(lessonData.lesson_text),
        root_cause: String(lessonData.root_cause || ""),
        farmer_notes: String(notes || ""),
        created_at: new Date(),
        created_at_vn: toVietnamISOString(),
        feedback_source: "evaluator_agent",
        evaluator_model: process.env.SAOLA4_MEDIUM_MODEL || "SaoLa4-medium",
    };

    await mongoDb.collection("lessons_learned").insertOne(lessonDocument);

    console.log(`[Evaluator] ✅ Bài học đã lưu: "${lessonDocument.lesson_text.substring(0, 80)}..."`);
    console.log(`[Evaluator]    Điều kiện: ${lessonDocument.condition_pattern}`);
    console.log(`[Evaluator]    Sai: ${lessonDocument.action_taken} → Đúng: ${lessonDocument.correct_action}`);

    return lessonDocument;
}

// ─── Fetch Recent Lessons (for Orchestrator prompt injection) ─────────────────

/**
 * Fetches the most recent lessons for injection into the Orchestrator's [RLHF_MEMORY] block.
 *
 * @param {number} limit - Max number of lessons to fetch (default: 5)
 * @returns {Promise<string>} - Formatted RLHF_MEMORY block
 */
async function buildRLHFMemoryBlock(limit = 5) {
    const mongoDb = getDb();
    if (!mongoDb) return "";

    try {
        const lessons = await mongoDb
            .collection("lessons_learned")
            .find({})
            .sort({ created_at: -1 })
            .limit(limit)
            .toArray();

        if (!lessons || lessons.length === 0) return "";

        const lines = lessons.map((l, i) =>
            `${i + 1}. [${l.action_taken} → nên ${l.correct_action}] Khi: ${l.condition_pattern}\n   Bài học: ${l.lesson_text}`
        );

        return `[RLHF_MEMORY — Bài học từ phản hồi nông dân]\n${lines.join("\n\n")}`;
    } catch (err) {
        console.warn("[Evaluator] Failed to fetch RLHF lessons:", err.message);
        return "";
    }
}

module.exports = {
    runEvaluatorAgent,
    buildRLHFMemoryBlock,
};
