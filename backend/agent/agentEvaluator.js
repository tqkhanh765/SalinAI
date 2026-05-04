const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatOpenAI } = require("@langchain/openai");
const { getDb } = require("../config/mongodb");
const { toVietnamISOString } = require("../utils/vietnamTime");
const { evaluatorSystemPrompt } = require("./prompt");

/**
 * Evaluator Agent — Feedback Loop (RLHF)
 * 
 * Role: Analyzes negative feedback (👎) to extract structured lessons.
 * Provider: SAOLA4_MEDIUM (FPT Cloud) or Gemini fallback.
 */

function createEvaluatorLLM() {
    const provider = String(process.env.FEEDBACK_AGENT_PROVIDER || "saola4_medium").toLowerCase().trim();

    if (provider === "saola4_medium") {
        const apiKey = process.env.SAOLA4_MEDIUM_API_KEY;
        const baseURL = process.env.SAOLA4_MEDIUM_BASE_URL;
        const model = process.env.SAOLA4_MEDIUM_MODEL || "SaoLa4-medium";
        if (apiKey && baseURL) {
            return new ChatOpenAI({
                model,
                apiKey,
                temperature: 0.1,
                configuration: { baseURL },
            });
        }
    }

    // Fallback to Gemini
    return new ChatGoogleGenerativeAI({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        temperature: 0.1,
    });
}

/**
 * Extracts a lesson from a failed decision.
 */
async function runEvaluatorAgent({ action_log_id, action_log, verdict, notes }) {
    if (verdict !== "incorrect") return null;

    const mongoDb = getDb();
    if (!mongoDb) throw new Error("[Evaluator] MongoDB not connected.");

    const llm = createEvaluatorLLM();

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

Tóm tắt phân tích của Researcher:
${researcherSummary.substring(0, 800)}

Phản hồi từ nông dân:
"${notes}"

Hãy phân tích và trả về JSON bài học theo đúng format yêu cầu.`;

    console.log(`[Evaluator] 🔍 Phân tích quyết định sai: action_log_id=${action_log_id}`);

    try {
        const response = await llm.invoke([
            { role: "system", content: evaluatorSystemPrompt },
            { role: "user", content: userMessage },
        ]);

        const rawContent = String(response?.content || "").trim();
        const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/) || rawContent.match(/(\{[\s\S]*\})/);
        const jsonString = jsonMatch ? jsonMatch[1].trim() : rawContent;
        const lessonData = JSON.parse(jsonString);

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
        
        return lessonDocument;
    } catch (err) {
        console.error("[Evaluator] Error in evaluation:", err.message);
        throw err;
    }
}

/**
 * Helper to build RLHF memory block for Orchestrator
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

        if (!lessons?.length) return "";

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
