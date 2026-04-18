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
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function compactSnippet(text, maxChars = 420) {
  const normalized = sanitizeRetrievalText(text)
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!normalized) return "Không có nội dung trích dẫn.";
  if (normalized.length <= maxChars) return normalized;

  return `${normalized.slice(0, maxChars).trim()}...`;
}

function normalizeSourceTitle(doc) {
  const title = sanitizeRetrievalText(doc?.title || "");
  if (title) return title;

  const id = String(doc?._id || "");
  if (id.includes("-chunk-")) {
    return id.split("-chunk-")[0].replace(/^paper-/, "Paper");
  }

  return id || "Unknown source";
}

function buildReadableRetrievalContext(docs, maxSnippetChars) {
  const lines = [];

  docs.forEach((doc, index) => {
    const sourceId = String(doc?._id || "unknown");
    const sourceTitle = normalizeSourceTitle(doc);
    const snippet = compactSnippet(doc?.content, maxSnippetChars);
    lines.push(
      `${index + 1}) Nguồn: ${sourceId}`,
      `   Tiêu đề: ${sourceTitle}`,
      `   Trích đoạn: ${snippet}`
    );
  });

  return lines.join("\n\n");
}

function getSourceGroupId(docId = "") {
  const id = String(docId || "");
  const chunkIndex = id.indexOf("-chunk-");
  return chunkIndex >= 0 ? id.slice(0, chunkIndex) : id;
}

function selectDiverseResults(results, topK, maxChunksPerSource, variationSeed = 0) {
  const groups = new Map();
  for (const doc of results) {
    const group = getSourceGroupId(doc?._id);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(doc);
  }

  // Sort each group by score descending first.
  for (const docs of groups.values()) {
    docs.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  }

  const sortedGroupEntries = Array.from(groups.entries())
    .sort((a, b) => Number((b[1]?.[0]?.score || 0)) - Number((a[1]?.[0]?.score || 0)));

  const selected = [];
  const perSourceCount = new Map();

  const candidatePerGroup = 3;

  for (const [group, docs] of sortedGroupEntries) {
    if (!docs?.length) continue;
    const used = perSourceCount.get(group) || 0;
    if (used >= maxChunksPerSource) continue;

    const usable = docs.slice(0, Math.min(candidatePerGroup, docs.length));
    const pickIndex = Math.abs(Number(variationSeed || 0) + selected.length) % usable.length;
    const doc = usable[pickIndex];

    selected.push(doc);
    perSourceCount.set(group, used + 1);
    if (selected.length >= topK) break;
  }

  return selected;
}

async function executeRAGTool(salinity, moisture, mongoDb, cropStage = "") {
  const stageText = String(cropStage || "").trim();
  const queryText = stageText
    ? `Salinity is ${salinity} ppt, moisture is ${moisture}%, crop stage is ${stageText}.`
    : `Salinity is ${salinity} ppt, moisture is ${moisture}%.`;
  const topK = Math.max(1, parseInt(process.env.VECTOR_TOP_K || "3", 10));
  const candidateLimit = Math.max(topK * 8, 24);
  const snippetChars = Math.max(160, parseInt(process.env.RETRIEVAL_SNIPPET_MAX_CHARS || "420", 10));
  const maxChunksPerSource = Math.max(1, parseInt(process.env.RETRIEVAL_MAX_CHUNKS_PER_SOURCE || "1", 10));
  const variationSeed = Math.round(Number(salinity || 0) * 10) + Math.round(Number(moisture || 0));

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
    const relevantResults = results.filter((r) => {
      const id = String(r?._id || "");
      return id.startsWith("paper-") || id.startsWith("guide-");
    });
    
    // Sử dụng minScore từ env (ưu tiên sự linh hoạt qua cấu hình)
    const envMinScore = parseFloat(process.env.VECTOR_MIN_SCORE || "0.68");
    const scoredResults = relevantResults.filter((r) => r.score >= envMinScore);

    const sortedResults = scoredResults.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

    const validResults = selectDiverseResults(sortedResults, topK, maxChunksPerSource, variationSeed);

    if (validResults.length === 0) {
      return { hitCount: 0, sourceIds: [], context: "No uploaded-paper evidence found via retrieval." };
    }

    const sourceIds = validResults.map((doc) => String(doc._id));
    const context = buildReadableRetrievalContext(validResults, snippetChars);

    return { hitCount: validResults.length, sourceIds, context };
  } catch (err) {
    console.error("Vector Retrieval Error:", err);
    return { hitCount: 0, sourceIds: [], context: "Vector Search offline." };
  }
}

module.exports = {
  embeddings,
  executeRAGTool,
};
