require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");

const URI = process.env.MONGODB_URI;
const DB_NAME = "salinai";
const COLLECTION_NAME = "guideline_documents";

const guidelines = [
  {
    _id: "guide-rice-seedling-001",
    title: "Rice irrigation guideline for seedling stage",
    content: "Seedling stage is highly vulnerable to salinity. IF salinity > 1.5 ppt, immediately close intake valve. DO NOT run pump under any circumstances if risk exists.",
    crop_type: "RICE",
    crop_stage: "SEEDLING",
    region: "MEKONG_DELTA",
    risk_tags: ["salinity", "vulnerable"],
    source_ref: "agri-bulletin-2026-04",
    revision: "2026.04"
  },
  {
    _id: "guide-rice-veg-014",
    title: "Rice irrigation guideline for vegetative stage",
    content: "During the vegetative stage, crops can tolerate mild salinity. IF salinity >= 3.0 ppt, close intake valve to prevent yield loss. If salinity < 1.0 ppt and weather is sunny, open valve for irrigation. Keep moisture above 60%.",
    crop_type: "RICE",
    crop_stage: "VEGETATIVE",
    region: "MEKONG_DELTA",
    risk_tags: ["salinity", "storm"],
    source_ref: "agri-bulletin-2026-04",
    revision: "2026.04"
  },
  {
    _id: "guide-rice-flowering-003",
    title: "Rice irrigation guideline for flowering stage",
    content: "Flowering stage is highly critical for yield. Ensure moisture > 70% at all times. IF salinity >= 2.0 ppt, close the intake valve to avoid flower drop. In drought conditions, prioritize any fresh water available.",
    crop_type: "RICE",
    crop_stage: "FLOWERING",
    region: "MEKONG_DELTA",
    risk_tags: ["salinity", "drought"],
    source_ref: "agri-bulletin-2026-04",
    revision: "2026.04"
  },
  {
    _id: "guide-rice-harvest-007",
    title: "Rice management near harvest stage",
    content: "When field is near harvest, drain excess water. High salinity is less impactful now. You should keep valves CLOSED to dry the field, unless moisture drops critically below 40%.",
    crop_type: "RICE",
    crop_stage: "HARVEST",
    region: "MEKONG_DELTA",
    risk_tags: ["drainage"],
    source_ref: "agri-bulletin-2026-04",
    revision: "2026.04"
  },
  {
    _id: "guide-rainfall-flooding-001",
    title: "Rainfall-based flood prevention guideline",
    content: "HEAVY RAINFALL ALERT: If rainfall in past 24 hours exceeds 40mm, IMMEDIATELY close the intake valve to prevent field flooding. This overrides salinity considerations. High rainfall + open valve = crop damage.",
    crop_type: "RICE",
    crop_stage: ["SEEDLING", "VEGETATIVE", "FLOWERING"],
    region: "MEKONG_DELTA",
    risk_tags: ["rainfall", "flooding", "critical"],
    source_ref: "hydrology-2026",
    revision: "2026.04",
    priority: "CRITICAL"
  },
  {
    _id: "guide-humidity-mold-001",
    title: "Humidity and moisture management",
    content: "IF humidity > 80% AND soil_moisture > 75% simultaneously, CLOSE valve immediately and consider turning pump ON to improve air circulation. High humidity + wet soil = fungal disease risk (mold, rice blast).",
    crop_type: "RICE",
    crop_stage: ["VEGETATIVE", "FLOWERING"],
    region: "MEKONG_DELTA",
    risk_tags: ["humidity", "disease", "mold"],
    source_ref: "phytopathology-2026",
    revision: "2026.04"
  },
  {
    _id: "guide-rising-tide-saltwater-001",
    title: "Rising tide and saltwater intrusion prevention",
    content: "TIDE ALERT: When tide is RISING and salinity >= 1.0 ppt, CLOSE the intake valve immediately. Rising tides bring saltwater inland. Early closure prevents salinity spike. Expected salinity can increase 2-3x during high tide.",
    crop_type: "RICE",
    crop_stage: ["SEEDLING", "VEGETATIVE"],
    region: "MEKONG_DELTA",
    risk_tags: ["tide", "salinity", "proactive"],
    source_ref: "oceanography-2026",
    revision: "2026.04",
    priority: "HIGH"
  },
  {
    _id: "guide-drought-water-conservation-001",
    title: "Drought response and water management",
    content: "DROUGHT CONDITIONS: If rainfall in past 24h < 2mm AND water_level < 0.8m AND soil_moisture < 40%, OPEN valve to irrigate. Drought overrides salinity thresholds up to 2.0 ppt. Crop survival takes priority.",
    crop_type: "RICE",
    crop_stage: ["VEGETATIVE", "FLOWERING"],
    region: "MEKONG_DELTA",
    risk_tags: ["drought", "water_conservation"],
    source_ref: "water-management-2026",
    revision: "2026.04"
  },
  {
    _id: "guide-combined-weather-salinity-001",
    title: "Combined weather and salinity decision matrix",
    content: "MULTI-FACTOR DECISION: (1) IF rainfall > 30mm: prioritize closing (flood prevention). (2) IF tide RISING: prioritize closing (salt prevention). (3) IF salinity > 2.5 AND (rainfall < 10 OR tide FALLING): open to dilute. (4) IF humidity > 85%: consider pump ON instead of valve open.",
    crop_type: "RICE",
    crop_stage: "VEGETATIVE",
    region: "MEKONG_DELTA",
    risk_tags: ["multifactor", "complex_decision"],
    source_ref: "integrated-agriculture-2026",
    revision: "2026.04"
  }
];

async function seedDatabase() {
  if (!URI) {
    console.error("❌ MONGODB_URI is undefined! Check your .env file.");
    process.exit(1);
  }

  const client = new MongoClient(URI);
  
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB.");
    
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    console.log("⏳ Initializing Gemini Embeddings (text-embedding-004)...");
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      console.error("❌ GEMINI_API_KEY or GOOGLE_API_KEY is not set in .env!");
      process.exit(1);
    }

    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: apiKey,
      model: process.env.EMBEDDING_MODEL || "text-embedding-004",
    });

    console.log(`⏳ Processing ${guidelines.length} guidelines for embeddings...`);
    
    for (const guide of guidelines) {
      // Create a cohesive string for accurate semantic understanding
      const textToEmbed = `Title: ${guide.title}\nCrop Stage: ${guide.crop_stage}\nGuideline: ${guide.content}`;
      
      const embeddingVector = await embeddings.embedQuery(textToEmbed);
      
      // Attach the resulting float array back to the document
      guide.embedding = embeddingVector;
      
      // Upsert into MongoDB
      await collection.updateOne(
        { _id: guide._id },
        { $set: guide },
        { upsert: true }
      );
      console.log(`✅ Seeded: ${guide._id}`);
    }

    console.log("\n🎉 Seeding complete! All documents have embeddings stored in MongoDB.");
    console.log("➡️  Next step: Go to MongoDB Atlas UI to create the Vector Search Index.");

  } catch (error) {
    console.error("❌ Error during seeding:", error);
  } finally {
    await client.close();
  }
}

seedDatabase();
