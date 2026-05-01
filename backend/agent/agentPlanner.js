/**
 * AGENT PLANNER
 * 
 * Tác dụng: Tác tử chuyên trách lập kế hoạch tưới tiêu chủ động.
 * Phân tích dự báo 5 ngày và đưa ra khuyến nghị kỹ thuật.
 * Brain: Ưu tiên GLM-4.7.
 */

const { ChatGoogleGenerativeAI } = require("@google/genai"); // Fixed import for consistency
const { ChatOpenAI } = require("@langchain/openai");
const { plannerSystemPrompt } = require("./prompt");
const { ChatGoogleGenerativeAI: LangChainGemini } = require("@langchain/google-genai");

/**
 * Factory function to create the Planning Agent LLM
 */
function createPlannerLLM() {
    const glm4Key = process.env.GLM4_API_KEY;
    const glm4Base = process.env.GLM4_BASE_URL;
    const glm4Model = process.env.GLM4_MODEL || "GLM-4.7";

    if (glm4Key && glm4Base) {
        return new ChatOpenAI({
            model: glm4Model,
            apiKey: glm4Key,
            temperature: 0.2,
            configuration: { baseURL: glm4Base },
        });
    }

    // Fallback to Gemini
    return new LangChainGemini({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        temperature: 0.2,
    });
}

/**
 * Run the Planning Agent
 */
async function runPlannerAgent(forecastData, cropStage = "VEGETATIVE") {
    console.log(`[Agent Planner] 🤖 Đang lập kế hoạch 5 ngày cho giai đoạn: ${cropStage}`);
    
    const llm = createPlannerLLM();
    const userMessage = `GIAI ĐOẠN CÂY TRỒNG HIỆN TẠI: ${cropStage}\n\nDỮ LIỆU DỰ BÁO CHI TIẾT:\n${JSON.stringify(forecastData, null, 2)}`;

    try {
        const response = await llm.invoke([
            { role: "system", content: plannerSystemPrompt },
            { role: "user", content: userMessage }
        ]);

        const rawContent = String(response?.content || "").trim();
        
        // Extract JSON array
        const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error("Agent failed to return a valid JSON array");
        
        return JSON.parse(jsonMatch[0]);
    } catch (err) {
        console.error("[Agent Planner] Execution error:", err.message);
        throw err;
    }
}

module.exports = {
    runPlannerAgent
};
