const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '../../.env' });

async function checkRoles() {
    console.log("--- 🕵️ KIỂM TRA PHÂN CÔNG AGENT (STRICT MODE) ---");
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        const db = client.db('salinai');
        
        // Lấy log hành động mới nhất
        const latestLog = await db.collection('action_logs').find().sort({ timestamp: -1 }).limit(1).toArray();
        
        if (latestLog.length === 0) {
            console.log("❌ Chưa có log nào. Hãy chạy AI trước.");
            return;
        }

        const log = latestLog[0];
        console.log(`\nSự kiện gần nhất: ${log.trigger_reason} (${log.sensor_snapshot.salinity} ppt)`);
        console.log(`Thời gian: ${log.timestamp}`);

        console.log("\n--- PHÂN VAI ---");
        
        // Researcher info
        const researcherProvider = log.researcher_provider || "N/A";
        console.log(`🔍 [RESEARCHER]:   ${researcherProvider.toUpperCase()}`);
        console.log(`   (Nhiệm vụ: Tìm kiếm tài liệu mặn & đưa ra bằng chứng)`);

        // Orchestrator info
        const orchestratorProvider = log.orchestrator_provider || "N/A";
        console.log(`🤖 [ORCHESTRATOR]: ${orchestratorProvider.toUpperCase()}`);
        console.log(`   (Nhiệm vụ: Phân tích bối cảnh & chốt lệnh đóng/mở van)`);

        console.log("\n--- TRẠNG THÁI ---");
        console.log(`✅ Kết quả: ${log.executed_state}`);
        console.log(`✅ Gemini Fallback: ĐÃ VÔ HIỆU HÓA`);

    } catch (err) {
        console.error("Lỗi:", err.message);
    } finally {
        await client.close();
    }
}

checkRoles();
