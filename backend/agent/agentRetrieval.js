const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");

const embeddings = new GoogleGenerativeAIEmbeddings({
  model: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

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
            contextDocs.push(`[${doc._id}] ${doc.title}: ${doc.content}`);
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
