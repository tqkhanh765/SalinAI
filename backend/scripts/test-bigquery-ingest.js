/**
 * test-bigquery-ingest.js
 * Giả lập luồng nhận dữ liệu từ Hardware và kích hoạt AI để kiểm tra BigQuery.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const axios = require('axios');

async function simulateIngest() {
  const url = `http://localhost:${process.env.PORT || 3001}/api/ingest`;
  
  // Giả lập dữ liệu độ mặn CAO để chắc chắn AI sẽ được kích hoạt
  const mockPayload = {
    salinity: 4.5, // Độ mặn cao (4.5 ppt)
    moisture: 35.0,
    temperature: 31.0,
    humidity: 75.0,
    river_water_level: 0.8,
    timestamp: new Date().toISOString()
  };

  console.log(`\n--- Giả lập Ingest dữ liệu (Salinity: ${mockPayload.salinity} ppt) ---`);
  
  try {
    const response = await axios.post(url, mockPayload);
    console.log(`✅ Server phản hồi:`, response.data.message);
    console.log(`ℹ️ Check log của Backend để xem AI có được trigger và log vào BigQuery không.`);
    console.log(`\nĐợi khoảng 10-20 giây để AI hoàn thành lập luận và ghi log quyết định cuối cùng...`);
  } catch (error) {
    console.error(`❌ Lỗi khi gửi request:`, error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error(`👉 Nhắc nhở: Bạn cần chạy 'npm run dev' ở folder backend trước!`);
    }
  }
}

simulateIngest();
