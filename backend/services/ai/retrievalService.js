/**
 * KNOWLEDGE RETRIEVAL SERVICE
 * 
 * Tác dụng: Chịu trách nhiệm toàn bộ quy trình từ viết lại câu hỏi (Query Rewriting)
 * bằng AI đến tìm kiếm Vector (Similarity Search) trên MongoDB Atlas để cung cấp 
 * bằng chứng (Evidence) cho các Agent.
 */

const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { ChatOpenAI } = require("@langchain/openai");
const { getDb } = require("../../config/mongodb");

// --- Configuration ---
const embeddings = new GoogleGenerativeAIEmbeddings({
    model: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

/**
 * Factory for Query Rewriter LLM (SaoLa Small for speed)
 */
function createQueryRewriterLLM() {
    const apiKey = process.env.SAOLA4_SMALL_API_KEY;
    const baseURL = process.env.SAOLA4_SMALL_BASE_URL;
    const model = process.env.SAOLA4_SMALL_MODEL || "saola4-small";

    if (apiKey && baseURL) {
        return new ChatOpenAI({
            model,
            apiKey,
            temperature: 0.1,
            configuration: { baseURL },
        });
    }

    // No fallback allowed
    throw new Error("[Query Rewriter] SaoLa 4 Small is not configured. Please check SAOLA4_SMALL_API_KEY and BASE_URL.");
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
async function generateSearchQueries(sensorData) {
    const { salinity, moisture, crop_stage, external_forecast } = sensorData;
    const llm = createQueryRewriterLLM();

    const prompt = `Bạn là chuyên gia phân tích truy vấn nông nghiệp. Hãy viết 3 câu truy vấn tìm kiếm ngắn bằng tiếng Việt để tra cứu guideline cho tình huống sau:
- Lúa giai đoạn: ${crop_stage}
- Độ mặn hiện tại: ${salinity} ppt
- Độ ẩm đất: ${moisture}%
- Thời tiết & Thủy triều: ${external_forecast?.weather || "Không rõ"}, ${external_forecast?.tide_status || "Không rõ"}

Yêu cầu:
1. Câu 1 tập trung vào ngưỡng mặn an toàn cho giai đoạn ${crop_stage}.
2. Câu 2 tập trung vào ảnh hưởng của thời tiết/thủy triều đến việc tưới tiêu.
3. Câu 3 tập trung vào kỹ thuật tối ưu năng suất lúa trong điều kiện này.
Chỉ trả về 3 câu truy vấn, mỗi câu một dòng, không đánh số.`;

    try {
        const response = await llm.invoke(prompt);
        const text = typeof response.content === 'string' ? response.content : response.content[0].text;
        return text.split("\n")
            .map(q => q.replace(/^\d+[\.\)]\s*/, "").replace(/^[\-\*]\s*/, "").trim())
            .filter(q => q.length > 5);
    } catch (err) {
        console.error("[Query Rewriter] Error:", err.message);
        return [`Hướng dẫn xử lý cho lúa giai đoạn ${crop_stage}`];
    }
}

/**
 * Execute RAG (Vector Search)
 */
async function executeRAGTool(query, mongoDb, sensorData = {}) {
    if (!mongoDb) return { context: "Lỗi kết nối cơ sở dữ liệu.", hitCount: 0, sourceIds: [] };

    try {
        const normalizedQuery = sanitizeRetrievalText(query) || "Hướng dẫn xử lý lúa theo tình huống hiện tại";
        const queryVector = await embeddings.embedQuery(normalizedQuery);
        const collection = mongoDb.collection("guideline_documents");

        const limit = parseInt(process.env.VECTOR_TOP_K || "3", 10);
        const minScore = parseFloat(process.env.VECTOR_MIN_SCORE || "0.5");
        console.log(`[RAG] Searching with limit=${limit}, minScore=${minScore}`);

        // Atlas Vector Search
        const results = await collection.aggregate([
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "embedding",
                    "queryVector": queryVector,
                    "numCandidates": 100,
                    "limit": limit
                }
            },
            {
                "$addFields": {
                    "score": { "$meta": "vectorSearchScore" }
                }
            },
            {
                "$match": {
                    "score": { "$gte": minScore }
                }
            },
            {
                "$project": {
                    "content": 1,
                    "metadata": 1,
                    "score": 1
                }
            }
        ]).toArray();

        if (!results.length) {
            return { context: "Không tìm thấy tài liệu phù hợp.", hitCount: 0, sourceIds: [] };
        }

        const context = results.map((res, i) => {
            const source = res.title || res._id || res.source_ref || "Tài liệu khoa học";
            const scorePercent = ((res.score || 0) * 100).toFixed(1);
            return `${i + 1}) Nguồn: ${source} (Độ liên quan: ${scorePercent}%)\n   Trích đoạn: ${compactSnippet(res.content)}`;
        }).join("\n\n");

        return {
            context,
            hitCount: results.length,
            sourceIds: results.map((res) => String(res._id || res.source_ref || res.metadata?.source || "Unknown")),
            docs: results.map((res) => ({
                source: String(res._id || res.source_ref || res.metadata?.source || "Unknown"),
                score: Number(res.score || 0),
                content: res.content,
            })),
            query: normalizedQuery,
        };
    } catch (err) {
        console.error("[RAG Tool] Error:", err.message);
        return { context: "Lỗi trong quá trình tìm kiếm kiến thức.", hitCount: 0, sourceIds: [] };
    }
}

module.exports = {
    generateSearchQueries,
    executeRAGTool
};
