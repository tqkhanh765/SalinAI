const { runAgent } = require("../agent/langchain");
const db = require("../config/firebase");
const { getDb, connectMongoDB } = require("../config/mongodb");

async function testThresholds() {
    console.log("🚀 Bắt đầu test AI Thresholds...");
    
    try {
        // Kết nối Mongo (vì Researcher cần RAG)
        await connectMongoDB();
        
        // Dữ liệu giả lập: Cực kỳ an toàn (0.1 ppt)
        const mockSensorData = {
            salinity: 0.1,
            moisture: 65.0,
            crop_stage: "VEGETATIVE",
            timestamp: Date.now()
        };

        console.log("📡 Gửi dữ liệu giả lập (Salinity: 1.5): AI nên nhạy bén hơn...");
        await runAgent(mockSensorData);

        // Đợi AI xử lý xong
        console.log("⏳ Đang đợi AI lưu kết quả vào Firebase...");
        await new Promise(r => setTimeout(r, 8000));

        const aiStatusSnap = await db.ref("SalinAI/ai_status").once("value");
        const status = aiStatusSnap.val();

        console.log("\n--- KẾT QUẢ KIỂM TRA ---");
        console.log("Thành phần:", status.threshold_ai_managed ? "✅ AI TỰ QUẢN LÝ" : "⚠️ CỨNG NHẮC");
        console.log("Ngưỡng Salinity Delta:", status.thresholds.salinity_delta);
        console.log("Ngưỡng Moisture Delta:", status.thresholds.moisture_delta);
        console.log("Tóm tắt từ logic:", status.threshold_summary);
        console.log("------------------------\n");

        if (status.threshold_ai_managed) {
            console.log("🎯 THÀNH CÔNG: AI đã tự tính toán ngưỡng dựa trên rủi ro!");
        } else {
            console.log("❌ THẤT BẠI: AI vẫn dùng giá trị mặc định.");
        }

    } catch (err) {
        console.error("❌ Lỗi khi chạy test:", err.message);
    } finally {
        process.exit();
    }
}

testThresholds();
