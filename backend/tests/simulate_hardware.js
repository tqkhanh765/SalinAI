/**
 * END-TO-END HARDWARE SIMULATION TEST (V3)
 * 
 * Tác dụng: Bắn 1 phát duy nhất và kiểm tra phản ứng của AI.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const db = require("../config/firebase");

async function runE2ESimulation() {
    console.log("======================================================");
    console.log("🚀 KHỞI CHẠY GIẢ LẬP THIẾT BỊ PHẦN CỨNG (V3)");
    console.log("======================================================");

    const sensorRef = db.ref("SalinAI/sensor_data");
    const actuatorRef = db.ref("SalinAI/actuator");
    const aiStatusRef = db.ref("SalinAI/ai_status");

    // Đẩy dữ liệu NGUY CẤP cực mạnh
    const mockTelemetry = {
        salinity: 7.5,          // Mặn cực cao
        moisture: 25.0,         // Đất rất khô
        ph: 7.0,
        river_water_level: 1.8,
        crop_stage: "VEGETATIVE",
        timestamp: new Date().toISOString()
    };

    console.log(`[Step 1] Đẩy dữ liệu NGUY CẤP (7.5 ppt) lên Firebase...`);
    await sensorRef.set(mockTelemetry);

    // Kiểm tra xem Watcher có nhận lệnh không
    console.log("[Step 2] Đợi Backend xác nhận đang xử lý (is_processing)...");
    
    return new Promise((resolve) => {
        let timeout = setTimeout(() => {
            console.log("❌ THẤT BẠI: Backend không hề phản ứng (Watcher có thể bị treo).");
            resolve(false);
        }, 55000);

        // Theo dõi trạng thái xử lý của AI
        aiStatusRef.child("is_processing").on("value", (snap) => {
            if (snap.val() === true) {
                console.log("✅ Backend đã nhận dữ liệu và đang gọi AI Agents...");
            }
        });

        // Theo dõi hành động cuối cùng
        actuatorRef.child("valve_state").on("value", (snapshot) => {
            const state = snapshot.val();
            if (state === "CLOSED") {
                console.log("======================================================");
                console.log("🎉 THÀNH CÔNG! HỆ THỐNG ĐÃ TỰ ĐỘNG ĐÓNG VAN.");
                console.log("Kết quả: AI đã bảo vệ ruộng lúa thành công.");
                console.log("======================================================");
                clearTimeout(timeout);
                aiStatusRef.off();
                actuatorRef.off();
                resolve(true);
            }
        });
    });
}

runE2ESimulation().then(success => {
    process.exit(success ? 0 : 1);
});
