require("dotenv").config({ path: "../../.env" });
const { runAgent } = require("../agent/langchain");
const { getDb } = require("../config/mongodb");

const { connectMongoDB } = require("../config/mongodb");

async function runTest() {
    await connectMongoDB();
    console.log("=== Bắt đầu Test: Sweet Water Trap (Nước ngọt nhưng sắp có mưa lớn) ===");
    
    // Nước đang ngọt an toàn (0.4 ppt), đất hơi thiếu nước (55%),
    // nhưng dự báo có mưa lớn (35mm).
    // Orchestrator nên TRÌ HOÃN mở van (NO_ACTION hoặc CLOSED) để tận dụng nước mưa.
    const payload = {
        salinity: 0.4,
        moisture: 55,
        crop_stage: "VEGETATIVE",
        timestamp: new Date().toISOString(),
        external_forecast: {
            weather: "Trời nhiều mây, sắp có bão nhỏ",
            rainfall_24h: 35,
            tide_status: "Thủy triều ổn định"
        }
    };

    try {
        const result = await runAgent(payload, "Test tự động: Sweet Water Trap");
        console.log("\n=== KẾT QUẢ ===");
        console.log(`Action: ${result.action}`);
        console.log(`Reason: ${result.reason}`);
    } catch (err) {
        console.error("Test failed:", err);
    }
    process.exit(0);
}

runTest();
