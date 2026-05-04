require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { MongoClient } = require('mongodb');
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");

const URI = process.env.MONGODB_URI;
const DB_NAME = "salinai";
const COLLECTION_NAME = "guideline_documents";

const guidelines = [
  {
    _id: "guide-awd-technique-001",
    title: "Kỹ thuật tưới ngập khô xen kẽ (AWD) tiết kiệm nước",
    content: "Kỹ thuật AWD: Khi lúa ở giai đoạn ĐẺ NHÁNH (Vegetative), hãy để nước tự cạn cho đến khi độ ẩm đất giảm còn 60% rồi mới tưới lại ngập 5cm. Việc này giúp rễ ăn sâu, chống đổ ngã và giảm phát thải khí nhà kính. CHỈ áp dụng khi độ mặn nguồn nước < 1.0 ppt.",
    crop_type: "RICE",
    crop_stage: "VEGETATIVE",
    region: "MEKONG_DELTA",
    risk_tags: ["AWD", "water_saving", "sustainable"],
    source_ref: "irri-guideline-2025",
    revision: "2026.04"
  },
  {
    _id: "guide-leaching-salt-001",
    title: "Kỹ thuật thau chua rửa mặn cấp tốc",
    content: "RỬA MẶN: Nếu ruộng vừa bị nhiễm mặn > 2.0 ppt và có nguồn nước ngọt dồi dào (< 0.5 ppt), hãy MỞ van cho nước chảy tràn liên tục trong 12h. Sau đó rút cạn và bón bổ sung lân, vôi để giải độc phèn mặn cho rễ.",
    crop_type: "RICE",
    crop_stage: ["SEEDLING", "VEGETATIVE"],
    region: "MEKONG_DELTA",
    risk_tags: ["leaching", "recovery", "emergency"],
    source_ref: "agri-extension-vn-2025",
    revision: "2026.04"
  },
  {
    _id: "guide-rice-variety-om5451",
    title: "Đặc tính chịu mặn giống lúa OM5451",
    content: "Giống lúa OM5451 có khả năng chịu mặn trung bình (tối đa 3.0 ppt ở giai đoạn sinh trưởng). Tuy nhiên, ở giai đoạn TRỔ BÔNG, nếu mặn > 1.5 ppt sẽ gây lem lép hạt nghiêm trọng. Cần ưu tiên đóng van tuyệt đối nếu lúa đang trổ.",
    crop_type: "RICE",
    crop_stage: ["VEGETATIVE", "FLOWERING"],
    region: "MEKONG_DELTA",
    risk_tags: ["variety", "OM5451", "sensitivity"],
    source_ref: "rice-institute-2025",
    revision: "2026.04"
  },
  {
    _id: "guide-local-wisdom-weather-001",
    title: "Kinh nghiệm dự báo mưa dựa trên mây và gió",
    content: "KINH NGHIỆM DÂN GIAN: Nếu thấy mây đen kéo đến từ phía Tây Nam kết hợp gió thổi mạnh, khả năng cao sẽ có mưa lớn trong 1-2h tới. Nếu đất đang quá khô (< 40%) nhưng dự báo có mưa, hãy khoan mở van để tránh lãng phí nước ngọt từ kênh và đón nước mưa sạch.",
    crop_type: "RICE",
    crop_stage: "ALL",
    region: "MEKONG_DELTA",
    risk_tags: ["wisdom", "weather_prediction"],
    source_ref: "local-farmers-2025",
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
