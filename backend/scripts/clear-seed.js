require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { MongoClient } = require('mongodb');

async function clearSeedData() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const collection = client.db("salinai").collection("guideline_documents");
    
    console.log("⏳ Đang xóa các dữ liệu seed cũ (guide-*)...");
    const result = await collection.deleteMany({ _id: { $regex: /^guide-/ } });
    console.log(`✅ Đã xóa ${result.deletedCount} tài liệu mẫu.`);
    
    const count = await collection.countDocuments();
    console.log(`📚 Hiện tại còn lại ${count} đoạn tri thức từ các bài báo khoa học.`);
  } catch (error) {
    console.error("❌ Lỗi:", error);
  } finally {
    await client.close();
  }
}

clearSeedData();
