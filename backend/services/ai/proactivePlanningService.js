/**
 * PROACTIVE PLANNING SERVICE
 * 
 * Tác dụng: Quản lý toàn bộ tính năng dự báo thời tiết 5 ngày và lập kế hoạch 
 * tưới tiêu chủ động. Bao gồm cả logic lưu trữ MongoDB và Lập lịch tự động (Cron).
 * 
 * Logic lập kế hoạch được thực hiện bởi: Agent Planner (backend/agent/agentPlanner.js).
 */

const cron = require("node-cron");
const axios = require("axios");
const { getDb } = require("../../config/mongodb");
const { toVietnamISOString } = require("../../utils/vietnamTime");
const { runPlannerAgent } = require("../../agent/agentPlanner");
const db = require("../../config/firebase");

// Tọa độ khu vực canh tác (Mặc định: Bạc Liêu, Việt Nam)
const LAT = process.env.FARM_LAT || "9.2941";
const LON = process.env.FARM_LON || "105.7244";

/**
 * 1. LOGIC LẬP KẾ HOẠCH (PLANNING)
 */

async function generateIrrigationPlan(forecastData, cropStage = "VEGETATIVE") {
    const mongoDb = getDb();
    if (!mongoDb) throw new Error("MongoDB not connected");

    try {
        const plan = await runPlannerAgent(forecastData, cropStage);

        const doc = {
            created_at: toVietnamISOString(new Date()),
            crop_stage: cropStage,
            forecast_raw: forecastData,
            plan: plan,
            source: "agent_planner"
        };

        await mongoDb.collection("irrigation_plans").insertOne(doc);
        console.log("✅ [Planning] Kế hoạch 5 ngày mới đã được lưu vào MongoDB.");
        
        return plan;
    } catch (err) {
        console.error("[Planning Service] Error:", err.message);
        throw err;
    }
}

async function getLatestPlan() {
    const mongoDb = getDb();
    if (!mongoDb) return null;

    return await mongoDb.collection("irrigation_plans")
        .find()
        .sort({ created_at: -1 })
        .limit(1)
        .toArray()
        .then(docs => docs[0] || null);
}

/**
 * 2. LOGIC LẬP LỊCH & THỜI TIẾT (SCHEDULING)
 */

async function fetch5DayForecast() {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FBangkok&forecast_days=5`;
    
    try {
        const response = await axios.get(url);
        return response.data.daily;
    } catch (err) {
        console.error("[Forecast] Failed to fetch weather:", err.message);
        return null;
    }
}

async function runDailyProactivePlanning() {
    console.log("[Scheduler] 🕒 Bắt đầu tiến trình lập kế hoạch chủ động...");
    
    try {
        const forecast = await fetch5DayForecast();
        if (!forecast) return;

        const sensorSnap = await db.ref("SalinAI/sensor_data/crop_stage").once("value");
        const cropStage = sensorSnap.val() || "VEGETATIVE";

        await generateIrrigationPlan(forecast, cropStage);
        console.log("[Scheduler] ✅ Đã hoàn thành lập kế hoạch chủ động hàng ngày.");
    } catch (err) {
        console.error("[Scheduler] Error in daily task:", err.message);
    }
}

function startProactivePlanningScheduler() {
    // Chạy vào 05:00 sáng hàng ngày (Vietnam TZ)
    cron.schedule("0 5 * * *", () => {
        runDailyProactivePlanning();
    }, {
        scheduled: true,
        timezone: "Asia/Bangkok"
    });

    console.log("   -> Proactive Planning Scheduler enabled (Daily at 05:00 AM)");
}

module.exports = {
    generateIrrigationPlan,
    getLatestPlan,
    startProactivePlanningScheduler,
    runDailyProactivePlanning
};
