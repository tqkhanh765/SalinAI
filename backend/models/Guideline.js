/**
 * Guideline Collection Schema Definition
 * Note: SalinAI uses the native MongoDB driver for maximum 
 * Vector Search performance, so this file acts as the single 
 * source of truth for the schema structure rather than a Mongoose Model.
 */

const COLLECTION_NAME = "guideline_documents";

const GuidelineSchema = {
  _id: "string",           // Unique ID (e.g., guide-rice-veg-014)
  title: "string",         // The title of the agricultural rule
  content: "string",       // The actual rule text for the AI to read
  crop_type: "string",     // e.g., "RICE"
  crop_stage: "string",    // The filter key (e.g., "SEEDLING", "VEGETATIVE")
  region: "string",        // e.g., "MEKONG_DELTA"
  risk_tags: "array",      // e.g., ["salinity", "storm"]
  source_ref: "string",    // Reference document
  revision: "string",      // Document version
  embedding: "array"       // [float] - The 3072 dimension vector math array
};

module.exports = {
  COLLECTION_NAME,
  GuidelineSchema
};
