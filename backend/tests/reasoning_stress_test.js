/**
 * reasoning_stress_test.js
 * 
 * Thử nghiệm khả năng lập luận của Agent với các kịch bản "khó" (Hard Scenarios).
 * Mục tiêu: Kiểm tra xem Agent có bị mâu thuẫn trong lập luận và có tuân thủ base cases không.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { runAgent } = require("../agent/langchain");
const mongoConfig = require("../config/mongodb");
const fbdb = require("../config/firebase");

const HARD_SCENARIOS = [
    {
        name: "SCENARIO 1: Chủ động tích trữ (Proactive Storage)",
        data: {
            salinity: 0.3,         // Nước ngọt
            moisture: 55,          // Ẩm ổn định
            crop_stage: "VEGETATIVE",
            external_forecast: {
                salinity_next_24h: 4.5, // Dự báo mặn cực cao vào ngày mai
                rainfall_24h: 0
            }
        },
        expected: "OPEN (Tích trữ nước ngọt trước khi mặn tới)"
    },
    {
        name: "SCENARIO 2: Hạn mặn kép (Double Disaster - Đánh đổi)",
        data: {
            salinity: 1.2,         // Mặn nhẹ (vượt ngưỡng 0.5)
            moisture: 18,          // Khô hạn nguy kịch
            crop_stage: "SEEDLING", // Cây con nhạy cảm
            external_forecast: {
                rainfall_24h: 0
            }
        },
        expected: "OPEN (Cứu hạn khẩn cấp dù mặn nhẹ)"
    },
    {
        name: "SCENARIO 3: Bẫy nước ngọt (Sweet Water Trap)",
        data: {
            salinity: 0.4,         // Nước ngọt
            moisture: 45,          // Ẩm ổn định
            crop_stage: "VEGETATIVE",
            external_forecast: {
                rainfall_24h: 35.0  // Sắp mưa rất to
            }
        },
        expected: "CLOSED / NO_ACTION (Chờ nước mưa, không lãng phí)"
    },
    {
        name: "SCENARIO 4: Lúa chín siết nước (Ripening Drainage)",
        data: {
            salinity: 0.2,         // Nước ngọt lịm
            moisture: 30,          // Đất đang khô
            crop_stage: "HARVEST", // Sắp thu hoạch
            external_forecast: {
                rainfall_24h: 0
            }
        },
        expected: "CLOSED (Phải siết nước để thu hoạch, dù đất khô)"
    },
    {
        name: "SCENARIO 5: Dữ liệu lỗi (Sensor Error)",
        data: {
            salinity: -5.0,        // Lỗi âm
            moisture: 160,         // Lỗi > 100%
            crop_stage: "VEGETATIVE"
        },
        expected: "NO_ACTION / CLOSED (Chế độ an toàn)"
    }
];

async function runStressTest() {
    console.log("🚀 BẮT ĐẦU STRESS TEST LẬP LUẬN AGENT...");
    
    // Đợi kết nối DB
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    for (const scenario of HARD_SCENARIOS) {
        console.log("\n" + "=".repeat(60));
        console.log(`📌 ĐANG CHẠY: ${scenario.name}`);
        console.log(`📊 Dữ liệu: Sal: ${scenario.data.salinity} | Moist: ${scenario.data.moisture} | Stage: ${scenario.data.crop_stage}`);
        console.log(`🎯 Kỳ vọng: ${scenario.expected}`);
        console.log("-".repeat(60));

        try {
            // Lưu ý: runAgent cập nhật trực tiếp lên Firebase và MongoDB
            await runAgent(scenario.data);
            console.log(`✅ Hoàn tất Scenario: ${scenario.name}`);
            
            // Đọc lại kết quả từ Firebase để kiểm tra logic
            const actuatorSnap = await fbdb.ref("SalinAI/actuator").once("value");
            const aiStatusSnap = await fbdb.ref("SalinAI/ai_status").once("value");
            
            console.log(`🤖 KẾT QUẢ AI:`);
            console.log(`   - Hành động: ${actuatorSnap.val()?.valve_state}`);
            console.log(`   - Lập luận: ${aiStatusSnap.val()?.last_reasoning}`);
            
        } catch (err) {
            console.error(`❌ LỖI Scenario ${scenario.name}:`, err.message);
        }
        
        // Nghỉ một chút giữa các test để tránh rate limit
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("🏁 STRESS TEST HOÀN TẤT.");
    process.exit(0);
}

runStressTest();
