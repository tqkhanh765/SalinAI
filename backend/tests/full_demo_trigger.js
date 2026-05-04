/**
 * full_demo_trigger.js
 * 
 * SCRIPT KÍCH HOẠT DEMO TOÀN DIỆN
 * Giả lập thiết bị IoT gửi dữ liệu mặn để kích hoạt AI.
 * 
 * HƯỚNG DẪN:
 * 1. Đảm bảo Backend đang chạy (npm run dev)
 * 2. Chạy script này: node tests/full_demo_trigger.js
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const API_URL = "http://localhost:3001/api/ingest";

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function triggerDemo() {
    console.log("🚀 BẮT ĐẦU KÍCH HOẠT DEMO TOÀN DIỆN (FULL PIPELINE)\n");

    // 1. Gửi dữ liệu Bình Thường
    console.log("📡 [Bước 1] Gửi dữ liệu cảm biến: TRẠNG THÁI AN TOÀN...");
    try {
        const safeData = {
            salinity: 0.5,
            moisture: 45,
            river_water_level: 1.2,
            temperature: 30,
            humidity: 60,
            ph: 7.0
        };
        const res1 = await axios.post(API_URL, safeData);
        console.log("   ✅ API Response:", res1.data.status);
    } catch (err) {
        console.error("   ❌ Lỗi khi gửi dữ liệu an toàn:", err.response?.data || err.message);
    }

    await sleep(40000); // Đợi 40 giây để hết Cooldown (8s) của hệ thống

    // 2. Gửi dữ liệu NGUY CẤP (MẶN CAO)
    console.log("\n📡 [Bước 2] Gửi dữ liệu cảm biến: CẢNH BÁO XÂM NHẬP MẶN (Salinity 4.8)!");
    try {
        const criticalData = {
            salinity: 4.8,  // Ngưỡng mặn cao (> 2.0) sẽ kích hoạt AI
            moisture: 30,
            river_water_level: 1.8,
            temperature: 32,
            humidity: 55,
            ph: 6.5
        };
        const res2 = await axios.post(API_URL, criticalData);
        console.log("   ✅ API Response:", res2.data.status);
        console.log("   💡 Lưu ý: Hệ thống Watcher đang xử lý ngầm...");
    } catch (err) {
        console.error("   ❌ Lỗi khi gửi dữ liệu nguy cấp:", err.response?.data || err.message);
    }

    console.log("\n---------------------------------------------------------");
    console.log("👀 KIỂM TRA TERMINAL ĐANG CHẠY BACKEND (npm run dev) NGAY BÂY GIỜ!");
    console.log("Bạn sẽ thấy AI Orchestrator bắt đầu 'suy nghĩ' (Reasoning)...");
    console.log("---------------------------------------------------------");

    // Đợi một chút để AI bắt đầu stream
    await sleep(2000);
    console.log("\n📊 Đang theo dõi trạng thái AI...");
    console.log("(Nhấn Ctrl+C để dừng theo dõi khi AI đã chạy xong)");
}

triggerDemo();
