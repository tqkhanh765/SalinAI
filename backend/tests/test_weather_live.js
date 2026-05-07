/**
 * TEST LIVE WEATHER FETCH (Bạc Liêu)
 * 
 * Tác dụng: Xóa cache, lấy dữ liệu thời tiết mới nhất cho Bạc Liêu 
 * và cập nhật lên Firebase để Dashboard đồng bộ.
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const weatherService = require("../services/external/weatherService");
const db = require("../config/firebase");

async function testLiveWeather() {
    console.log("======================================================");
    console.log("📡 ĐANG LẤY DỮ LIỆU THỜI TIẾT THỰC TẾ (BẠC LIÊU)...");
    console.log("======================================================");

    try {
        // 1. Lấy dữ liệu mới (Service sẽ tự gọi API vì tọa độ đã đổi)
        const weather = await weatherService.fetchWeatherData();
        console.log("✅ Dữ liệu nhận được từ Open-Meteo:");
        console.log(`   - Nhiệt độ: ${weather.temperature}°C`);
        console.log(`   - Độ ẩm: ${weather.humidity}%`);
        console.log(`   - Thời tiết: ${weather.weather} (Code: ${weather.weather_code})`);
        console.log(`   - Lượng mưa 24h: ${weather.rainfall_24h}mm`);

        // 2. Cập nhật lên Firebase
        const sensorRef = db.ref("SalinAI/sensor_data");
        console.log("\n[Step 2] Đang cập nhật lên Firebase...");
        
        await sensorRef.update({
            temperature: weather.temperature,
            humidity: weather.humidity,
            weather_desc: weather.weather,
            weather_code: weather.weather_code,
            precipitation_sum: weather.rainfall_24h,
            tide_status: weather.tide_status,
            last_api_update: new Date().toISOString()
        });

        console.log("🎉 CẬP NHẬT THÀNH CÔNG! Dashboard sẽ thay đổi ngay bây giờ.");
        console.log("======================================================");
        process.exit(0);
    } catch (err) {
        console.error("❌ LỖI:", err.message);
        process.exit(1);
    }
}

testLiveWeather();
