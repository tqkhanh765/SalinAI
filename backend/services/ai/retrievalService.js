/**
 * KNOWLEDGE RETRIEVAL SERVICE
 * 
 * Tác dụng: Chịu trách nhiệm toàn bộ quy trình từ viết lại câu hỏi (Query Rewriting)
 * bằng AI đến tìm kiếm Vector (Similarity Search) trên MongoDB Atlas để cung cấp 
 * bằng chứng (Evidence) cho các Agent.
 */

const { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { getDb } = require("../../config/mongodb");

// --- Configuration ---
const embeddings = new GoogleGenerativeAIEmbeddings({
    model: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

function createQueryRewriterLLM() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    return new ChatGoogleGenerativeAI({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        apiKey: apiKey,
        temperature: 0.2,
    });
}

// --- Internal Helpers ---

function sanitizeRetrievalText(text) {
    if (!text) return "";
    return String(text)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
        .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function compactSnippet(text, maxChars = 420) {
    const normalized = sanitizeRetrievalText(text);
    if (!normalized) return "Không có nội dung trích dẫn.";
    return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars).trim()}...`;
}

/**
 * AI-powered Query Expansion
 */
async function generateSearchQueries(context) {
    try {
        const llm = createQueryRewriterLLM();
        const prompt = `Bạn là một chuyên gia nông nghiệp lúa nước. Dựa vào tình huống môi trường hiện tại, hãy viết 2-3 câu truy vấn tìm kiếm ngắn bằng tiếng Việt để tìm tài liệu hướng dẫn trong DB.
Tình huống: Mặn ${context.salinity}ppt, Ẩm ${context.moisture}%, Giai đoạn ${context.crop_stage}, Thời tiết ${context.external_forecast?.weather}.
Chỉ trả về danh sách câu hỏi bắt đầu bằng dấu gạch ngang (-).`;
        
        const response = await llm.invoke(prompt);
        const text = typeof response.content === "string" ? response.content : "";
        
        return text.split("\n")
            .map(line => line.trim())
            .filter(line => line.startsWith("-"))
            .map(line => line.replace(/^-/, "").trim())
            .filter(Boolean);
    } catch (err) {
        console.warn("[Retrieval] Query rewriter failed, using fallback.");
        return [`Hướng dẫn xử lý cho lúa giai đoạn ${context.crop_stage}`];
    }
}

/**
 * Unified Semantic RAG Execution
 */
async function executeRAGTool(queryText, mongoDb, variationParams = {}) {
    const topK = parseInt(process.env.VECTOR_TOP_K || "3", 10);
    const snippetChars = parseInt(process.env.RETRIEVAL_SNIPPET_MAX_CHARS || "420", 10);
    const envMinScore = parseFloat(process.env.VECTOR_MIN_SCORE || "0.68");

    try {
        const queryVector = await embeddings.embedQuery(queryText);
        const cursor = mongoDb.collection("guideline_documents").aggregate([
            {
                $vectorSearch: {
                    index: "vector_index",
                    path: "embedding",
                    queryVector,
                    numCandidates: topK * 10,
                    limit: topK * 4,
                },
            },
            { $project: { _id: 1, title: 1, content: 1, score: { $meta: "vectorSearchScore" } } },
        ]);

        const results = await cursor.toArray();
        const validResults = results
            .filter(r => r.score >= envMinScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        if (validResults.length === 0) {
            return { hitCount: 0, context: "Không tìm thấy tài liệu phù hợp.", docs: [] };
        }

        const context = validResults.map((doc, i) => 
            `${i+1}) Nguồn: ${doc._id}\n   Trích đoạn: ${compactSnippet(doc.content, snippetChars)}`
        ).join("\n\n");

        return { hitCount: validResults.length, sourceIds: validResults.map(d => d._id), context, docs: validResults };
    } catch (err) {
        console.error("Vector Retrieval Error:", err.message);
        return { hitCount: 0, context: "Lỗi hệ thống truy xuất.", docs: [] };
    }
}

module.exports = {
    generateSearchQueries,
    executeRAGTool,
};
