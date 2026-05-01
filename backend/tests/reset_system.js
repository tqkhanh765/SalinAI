const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const db = require("../config/firebase");

async function resetSystem() {
    console.log("🧹 Đang dọn dẹp trạng thái Firebase...");
    
    await db.ref("SalinAI/ai_status").update({
        is_processing: false,
        last_reasoning: "Hệ thống đã được reset thủ công."
    });

    await db.ref("SalinAI/actuator_state").set({
        valve_state: "CLOSED",
        pump_state: "OFF",
        control_mode: "AUTO"
    });

    console.log("✅ Đã reset thành công. Hệ thống sẵn sàng cho bài test mới.");
    process.exit(0);
}

resetSystem();
