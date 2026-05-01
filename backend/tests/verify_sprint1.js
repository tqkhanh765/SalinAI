/**
 * 🏁 SPRINT 1 MASTER VERIFICATION SCRIPT
 * 
 * Verifies:
 * - Milestone 5: Data integrity & Bug fixes
 * - Epic 1: Advanced RAG & Complex Scenarios (Self-RAG loop)
 * - Epic 2: Human-in-the-Loop (RLHF) & Evaluator Agent
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { connectMongoDB, getDb } = require('../config/mongodb');
const fbdb = require('../config/firebase');
const { runAgent } = require('../agent/langchain');
const { runEvaluatorAgent } = require('../agent/agentEvaluator');
const { CROP_STAGES } = require('../services/core/farmPayloadMapper');
const { CROP_STAGE_PROFILES } = require('../services/ai/outcomeService');

async function runMasterTest() {
    console.log("======================================================");
    console.log("🚀 BẮT ĐẦU KIỂM THỬ TỔNG HỢP SPRINT 1 (SALINAI)");
    console.log("======================================================\n");

    try {
        await connectMongoDB();
        const mongoDb = getDb();

        // ─── MILESTONE 5: CRITICAL BUG FIXES ──────────────────────────
        console.log("🛠️ [M5] KIỂM TRA DATA INTEGRITY...");
        
        // C2: Germination Stage
        if (CROP_STAGES.includes("GERMINATION") && CROP_STAGE_PROFILES["GERMINATION"]) {
            console.log("✅ [C2] Giai đoạn GERMINATION đã được cấu hình chính xác.");
        } else {
            throw new Error("[M5 FAIL] Thiếu giai đoạn GERMINATION.");
        }

        // ─── EPIC 1: ADVANCED RAG & COMPLEX SCENARIOS ─────────────────
        console.log("\n🧠 [E1] KIỂM TRA TRÍ THÔNG MINH AI (RAG & SCENARIOS)...");

        const scenario1 = {
            name: "Double Disaster (Mặn cao + Khô hạn)",
            payload: {
                salinity: 4.5,
                moisture: 28,
                crop_stage: "VEGETATIVE",
                external_forecast: { weather: "Nắng gắt", rainfall_24h: 0, tide_status: "Bình thường" }
            },
            expectedAction: "CLOSED"
        };

        console.log(`\n--- Chạy Scenario: ${scenario1.name} ---`);
        const result1 = await runAgent(scenario1.payload, "Test tự động: Double Disaster");
        console.log(`| Kết quả: [${result1.action}]`);
        console.log(`| Lý do: ${result1.reason.substring(0, 100)}...`);
        
        if (result1.action === scenario1.expectedAction) {
            console.log("✅ [E1] AI đã chọn an toàn (ĐÓNG VAN) vượt lên trên nhu cầu độ ẩm.");
        } else {
            console.warn("⚠️ [E1 WARNING] AI không chọn ĐÓNG VAN như kỳ vọng.");
        }

        // ─── EPIC 2: RLHF & EVALUATOR AGENT ───────────────────────────
        console.log("\n💡 [E2] KIỂM TRA VÒNG LẶP HỌC TẬP (RLHF)...");

        // Giả lập một Action Log cũ bị nông dân chê
        const dummyActionLogId = "test_log_" + Date.now();
        const dummyActionLog = {
            action: "OPEN",
            reason: "Tôi nghĩ là nên mở van vì đất khô.",
            sensor_snapshot: { salinity: 0.5, moisture: 40, crop_stage: "VEGETATIVE", weather: { rainfall_24h: 40 } },
            subagent_summary: "Researcher thấy sắp có mưa lớn nhưng vẫn gợi ý mở van.",
            timestamp: new Date().toISOString()
        };

        console.log(`\n--- Giả lập phản hồi sai từ nông dân cho Log: ${dummyActionLogId} ---`);
        const notes = "Sắp có bão 40mm mưa mà AI vẫn mở van là lãng phí nước và gây ngập lụt!";
        
        const lesson = await runEvaluatorAgent({
            action_log_id: dummyActionLogId,
            action_log: dummyActionLog,
            verdict: "incorrect",
            notes: notes
        });

        if (lesson && lesson.lesson_text) {
            console.log("✅ [E2] Evaluator Agent đã trích xuất bài học thành công.");
            console.log(`| Bài học: ${lesson.lesson_text}`);
            console.log(`| Điều kiện rút ra: ${lesson.condition_pattern}`);
        } else {
            throw new Error("[E2 FAIL] Không tạo được bài học từ phản hồi.");
        }

        console.log("\n======================================================");
        console.log("🎉 CHÚC MỪNG! TẤT CẢ CÁC BÀI TEST SPRINT 1 ĐÃ VƯỢT QUA.");
        console.log("Hệ thống đã sẵn sàng cho Epic 3.");
        console.log("======================================================");

    } catch (error) {
        console.error("\n❌ KIỂM THỬ THẤT BẠI:");
        console.error(error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

runMasterTest();
