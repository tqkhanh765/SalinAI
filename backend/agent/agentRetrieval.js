const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");

const embeddings = new GoogleGenerativeAIEmbeddings({
  model: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

function sanitizeRetrievalText(text) {
    if (!text) return "";

    return String(text)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
        .replace(/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g, " ")
        .replace(/[\uFFFD]/g, " ")
  .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

async function executeRAGTool(salinity, moisture, mongoDb) {
    const queryText = `Salinity is ${salinity} ppt, moisture is ${moisture}%.`;
    try {
        const queryVector = await embeddings.embedQuery(queryText);
        const cursor = mongoDb.collection("guideline_documents").aggregate([
          {
            "$vectorSearch": {
              "index": "vector_index",
              "path": "embedding",
              "queryVector": queryVector,
              "numCandidates": 10,
              "limit": parseInt(process.env.VECTOR_TOP_K || "3")
            }
          },
          { "$project": { "_id": 1, "title": 1, "content": 1, "score": { "$meta": "vectorSearchScore" } } }
        ]);
        const results = await cursor.toArray();
        const minScore = parseFloat(process.env.VECTOR_MIN_SCORE || "0.72");
        const validResults = results.filter(r => r.score >= minScore);
        
        if (validResults.length === 0) {
            return { hitCount: 0, sourceIds: [], context: "No guidelines found via search." };
        }
        
        let sourceIds = [];
        let contextDocs = [];
        validResults.forEach(doc => {
            sourceIds.push(doc._id);
          const cleanTitle = sanitizeRetrievalText(doc.title);
          const cleanContent = sanitizeRetrievalText(doc.content);
          contextDocs.push(`[${doc._id}] ${cleanTitle}: ${cleanContent}`);
        });
        
        return { hitCount: validResults.length, sourceIds, context: contextDocs.join("\n\n") };
    } catch (err) {
        console.error("Vector Retrieval Error:", err);
        return { hitCount: 0, sourceIds: [], context: "Vector Search offline." };
    }
}

module.exports = {
    embeddings,
    executeRAGTool,
};
