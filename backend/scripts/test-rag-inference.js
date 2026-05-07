const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
process.env.AI_PROVIDER = 'gemini';
const { runAgent } = require('../agent/langchain');
const { connectMongoDB } = require('../config/mongodb');

async function test() {
    console.log("🧪 Đang kiểm tra suy luận AI với kho tri thức khoa học...");
    
    await connectMongoDB();
    
    const sensorData = {
        salinity: 4.2,
        moisture: 35,
        crop_stage: "VEGETATIVE",
        external_forecast: {
            weather: "Sunny",
            rainfall_24h: 0,
            tide_status: "RISING"
        }
    };
    
    console.log("📡 Dữ liệu cảm biến giả lập:", JSON.stringify(sensorData, null, 2));
    
    try {
        const result = await runAgent(sensorData, "Test suy luận với dữ liệu khoa học mới");
        console.log("\n====================================================");
        console.log("🤖 KẾT QUẢ TỪ AI:");
        console.log("Hành động:", result.action);
        console.log("Lý do:", result.reason);
        console.log("Nguồn tham khảo:", result.source_ids);
        console.log("====================================================");
    } catch (error) {
        console.error("❌ Lỗi khi chạy Agent:", error);
    } finally {
        process.exit(0);
    }
}

test();
