const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatOpenAI } = require("@langchain/openai");
const { researcherTools } = require("./tools");

function createResearcherLLM() {
    const provider = String(process.env.RESEARCHER_PROVIDER || process.env.AI_PROVIDER || "gemini").toLowerCase();
    const temperature = Number(process.env.RESEARCHER_TEMPERATURE || process.env.LLM_TEMPERATURE || "0.2");

    if (provider === "saola") {
        const apiKey = process.env.SAOLA_API_KEY;
        const baseURL = process.env.SAOLA_BASE_URL;
        const model = process.env.RESEARCHER_MODEL || process.env.SAOLA_MODEL || "saola-chat";

        if (!apiKey || !baseURL) {
            throw new Error("RESEARCHER_PROVIDER=saola requires SAOLA_API_KEY and SAOLA_BASE_URL");
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
