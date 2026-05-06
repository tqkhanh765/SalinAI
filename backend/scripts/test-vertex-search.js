/**
 * Script to test Vertex AI Search (Discovery Engine) connectivity.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { querySalinKnowledge } = require('../services/ai/vertexSearchService');

async function testVertexSearch() {
  console.log(`\n--- SalinAI Vertex AI Search Test ---`);
  console.log(`Project ID: ${process.env.GOOGLE_PROJECT_ID}`);
  console.log(`Data Store ID: ${process.env.VERTEX_DATA_STORE_ID}`);
  console.log(`Location: ${process.env.VERTEX_LOCATION || 'global'}`);

  if (!process.env.VERTEX_DATA_STORE_ID || process.env.VERTEX_DATA_STORE_ID === 'tên_id_data_store_của_bạn') {
    console.error("❌ Lỗi: Bạn chưa cấu hình VERTEX_DATA_STORE_ID trong file .env!");
    return;
  }

  const testQuery = "Cách xử lý lúa khi độ mặn tăng cao trên 2 ppt?";
  
  try {
    console.log(`\n🔍 Đang gửi câu hỏi thử nghiệm: "${testQuery}"...`);
    console.time("Latency");
    
    const result = await querySalinKnowledge(testQuery);
    
    console.timeEnd("Latency");
    console.log(`\n📄 Kết quả trả về từ Vertex AI:`);
    console.log(`--------------------------------------------------`);
    console.log(result);
    console.log(`--------------------------------------------------`);
    
    if (result.includes("Không tìm thấy") || result.includes("không khả dụng")) {
      console.warn("\n⚠️ Lưu ý: Kết nối thành công nhưng không tìm thấy nội dung phù hợp. Hãy đảm bảo bạn đã tải PDF lên Data Store và đã hoàn tất việc indexing.");
    } else {
      console.log("\n✅ Vertex AI Search hoạt động ỔN ĐỊNH!");
    }
    
  } catch (error) {
    console.error('\n❌ Lỗi nghiêm trọng khi kết nối Vertex AI:', error.message);
  }
}

testVertexSearch();
