/**
 * Retrieval service.
 * Runs vector similarity search over guideline documents and returns clean evidence chunks for the Researcher tool.
 */
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

async function executeRAGTool(salinity, moisture, mongoDb, cropStage = "") {
  const stageText = String(cropStage || "").trim();
  const queryText = stageText
    ? `Salinity is ${salinity} ppt, moisture is ${moisture}%, crop stage is ${stageText}.`
    : `Salinity is ${salinity} ppt, moisture is ${moisture}%.`;
  const topK = Math.max(1, parseInt(process.env.VECTOR_TOP_K || "3", 10));
  const candidateLimit = Math.max(topK * 8, 24);
  const allowedSourceRef = String(process.env.RETRIEVAL_ALLOWED_SOURCE_REF || "FILE_UPLOAD").trim();

  try {
    const queryVector = await embeddings.embedQuery(queryText);
    const cursor = mongoDb.collection("guideline_documents").aggregate([
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector,
          numCandidates: Math.max(candidateLimit * 2, 40),
          limit: candidateLimit,
        },
      },
      { $project: { _id: 1, title: 1, content: 1, source_ref: 1, score: { $meta: "vectorSearchScore" } } },
    ]);

    const results = await cursor.toArray();
    const minScore = parseFloat(process.env.VECTOR_MIN_SCORE || "0.72");
    const paperOnlyResults = results.filter((r) => {
      const id = String(r?._id || "");
      const sourceRef = String(r?.source_ref || "");
      return id.startsWith("paper-") || (allowedSourceRef && sourceRef === allowedSourceRef);
    });
    const validResults = paperOnlyResults
      .filter((r) => r.score >= minScore)
      .slice(0, topK);

    if (validResults.length === 0) {
      return { hitCount: 0, sourceIds: [], context: "No uploaded-paper evidence found via retrieval." };
    }

    const sourceIds = [];
    const contextDocs = [];

    validResults.forEach((doc) => {
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
