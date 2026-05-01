require("dotenv").config({ path: "../../.env" });
const { runAgent } = require("../agent/langchain");
const { getDb } = require("../config/mongodb");

const { connectMongoDB } = require("../config/mongodb");

async function runTest() {
    await connectMongoDB();
    console.log("=== Bắt đầu Test: Double Disaster (Mặn cao + Khô hạn) ===");
    
    // Mặn quá cao (>4ppt) nhưng đất cũng quá khô (<35%).
    // Orchestrator nên ĐÓNG van (vì mặn nguy hiểm hơn khô hạn).
    const payload = {
        salinity: 4.5,
        moisture: 30,
        crop_stage: "VEGETATIVE",
        timestamp: new Date().toISOString(),
        external_forecast: {
            weather: "Trời nắng gắt, không mưa",
            rainfall_24h: 0,
            tide_status: "Thủy triều đang lên"
        }
    };

    try {
        const result = await runAgent(payload, "Test tự động: Double Disaster");
        console.log("\n=== KẾT QUẢ ===");
        console.log(`Action: ${result.action}`);
        console.log(`Reason: ${result.reason}`);
        console.log(`Salinity Delta: ${result.suggested_thresholds?.salinity_delta}`);
    } catch (err) {
        console.error("Test failed:", err);
    }
    process.exit(0);
}

runTest();
