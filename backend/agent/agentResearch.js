const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatOpenAI } = require("@langchain/openai");
const { researcherTools } = require("./tools");

function normalizeResearcherProvider() {
    const explicitProvider = String(process.env.RESEARCHER_PROVIDER || "").toLowerCase().trim();
    if (explicitProvider) return explicitProvider;

    const globalProvider = String(process.env.AI_PROVIDER || "gemini").toLowerCase();
    if (globalProvider === "saola4_medium") {
        return "gemini";
    }

    return globalProvider;
}

function createResearcherLLM() {
    const provider = normalizeResearcherProvider();
    const temperature = Number(process.env.RESEARCHER_TEMPERATURE || process.env.LLM_TEMPERATURE || "0.2");

    if (provider === "saola4_small") {
        const apiKey = process.env.SAOLA4_SMALL_API_KEY;
        const baseURL = process.env.SAOLA4_SMALL_BASE_URL;
        const model = process.env.SAOLA4_SMALL_MODEL || "saola4-small";

        if (!apiKey || !baseURL) {
            throw new Error("RESEARCHER_PROVIDER=saola4_small requires SAOLA4_SMALL_API_KEY and SAOLA4_SMALL_BASE_URL");
        }

        return new ChatOpenAI({
            model,
            apiKey,
            temperature,
            configuration: {
                baseURL,
            },
        });
    }

    return new ChatGoogleGenerativeAI({
        model: process.env.RESEARCHER_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        temperature,
    });
}

const researcherAgent = createResearcherLLM().bindTools(researcherTools);

module.exports = {
    researcherAgent,
};
