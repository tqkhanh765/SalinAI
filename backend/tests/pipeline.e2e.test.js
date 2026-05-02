/**
 * pipeline.e2e.test.js
 *
 * End-to-End Integration Tests — NO MOCKS.
 * Connects to real Firebase Realtime Database and MongoDB Atlas.
 *
 * Run with:  node tests/pipeline.e2e.test.js
 *
 * Requires:  serviceAccountKey.json + .env file at repo root.
 * These tests verify the full production pipeline is working correctly.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const db = require("../config/firebase");
const mongoConfig = require("../config/mongodb");

// ─── Test Helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
        results.push({ name, status: "PASS" });
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`         → ${err.message}`);
        failed++;
        results.push({ name, status: "FAIL", error: err.message });
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
}

// ─── Test Suites ─────────────────────────────────────────────────────────────

async function runFirebaseTests() {
    console.log("\n📡 Firebase Realtime Database Tests");

    await test("Firebase: kết nối thành công (đọc được root node)", async () => {
        // Admin SDK không dùng WebSocket nên .info/connected luôn false
        // Kiểm tra bằng cách đọc thực tế một node nhẹ thay vì .info/connected
        const snap = await db.ref("SalinAI").limitToFirst(1).once("value");
        assert(snap !== null, "Không thể đọc node SalinAI từ Firebase");
    });

    await test("Firebase: đọc được SalinAI/sensor_data", async () => {
        const snap = await db.ref("SalinAI/sensor_data").once("value");
        // Không cần có data — chỉ cần không throw
        assert(snap !== null, "Không đọc được SalinAI/sensor_data");
    });

    await test("Firebase: đọc được SalinAI/ai_status", async () => {
        const snap = await db.ref("SalinAI/ai_status").once("value");
        assert(snap !== null, "Không đọc được SalinAI/ai_status");
    });

    await test("Firebase: đọc được SalinAI/actuator", async () => {
        const snap = await db.ref("SalinAI/actuator").once("value");
        assert(snap !== null, "Không đọc được SalinAI/actuator");
    });

    await test("Firebase: orderByChild trên action_logs không bị lỗi", async () => {
        const snap = await db
            .ref("SalinAI/action_logs")
            .orderByChild("timestamp")
            .limitToLast(1)
            .once("value");
        assert(snap !== null, "orderByChild thất bại");
    });

    await test("Firebase: ghi và đọc lại một node test tạm thời", async () => {
        const testRef = db.ref("SalinAI/__e2e_test__");
        const writeValue = { ok: true, ts: Date.now() };
        await testRef.set(writeValue);

        const readSnap = await testRef.once("value");
        const readValue = readSnap.val();

        // Cleanup ngay
        await testRef.remove();

        assert(readValue?.ok === true, "Giá trị ghi vào không khớp với giá trị đọc lại");
        assert(typeof readValue?.ts === "number", "Timestamp không phải dạng number");
    });
}

async function runMongoDBTests() {
    console.log("\n🍃 MongoDB Atlas Tests");

    await test("MongoDB: client khởi tạo thành công", async () => {
        assert(mongoConfig.client !== null, "MongoDB client là null — kiểm tra MONGODB_URI trong .env");
    });

    await test("MongoDB: ping database thành công", async () => {
        await mongoConfig.client.db().command({ ping: 1 });
    });

    await test("MongoDB: đọc được collection 'sensor_history'", async () => {
        const mongoDb = mongoConfig.getDb();
        assert(mongoDb !== null, "getDb() trả về null");
        const count = await mongoDb.collection("sensor_history").countDocuments();
        assert(typeof count === "number", "countDocuments không trả về số");
        console.log(`         → sensor_history có ${count} bản ghi`);
    });

    await test("MongoDB: đọc được collection 'decision_feedback'", async () => {
        const mongoDb = mongoConfig.getDb();
        const count = await mongoDb.collection("decision_feedback").countDocuments();
        assert(typeof count === "number");
        console.log(`         → decision_feedback có ${count} bản ghi`);
    });

    await test("MongoDB: đọc được collection 'lessons_learned'", async () => {
        const mongoDb = mongoConfig.getDb();
        const count = await mongoDb.collection("lessons_learned").countDocuments();
        assert(typeof count === "number");
        console.log(`         → lessons_learned có ${count} bản ghi`);
    });

    await test("MongoDB: đọc được collection 'irrigation_plans'", async () => {
        const mongoDb = mongoConfig.getDb();
        const latestPlan = await mongoDb
            .collection("irrigation_plans")
            .findOne({}, { sort: { created_at: -1 } });
        // Không bắt buộc phải có plan — chỉ cần query không throw
        if (latestPlan) {
            assert(Array.isArray(latestPlan.plan), "irrigation_plan.plan không phải array");
            console.log(`         → Tìm thấy kế hoạch tưới tạo lúc: ${latestPlan.created_at}`);
        } else {
            console.log(`         → Chưa có kế hoạch tưới nào (bình thường nếu chưa trigger)`);
        }
    });
}

async function runPipelineTests() {
    console.log("\n🔗 Pipeline Integration Tests");

    await test("Pipeline: Firebase ai_status có đúng cấu trúc", async () => {
        const snap = await db.ref("SalinAI/ai_status").once("value");
        const data = snap.val();
        if (data) {
            assert(
                typeof data.is_processing === "boolean" || data.is_processing === undefined,
                "is_processing không phải boolean"
            );
        }
        // Nếu chưa có data thì cũng OK — hệ thống chưa chạy lần nào
    });

    await test("Pipeline: Firebase actuator có valve_state hợp lệ (nếu tồn tại)", async () => {
        const snap = await db.ref("SalinAI/actuator").once("value");
        const data = snap.val();
        if (data?.valve_state) {
            const validStates = ["OPEN", "CLOSED"];
            assert(
                validStates.includes(data.valve_state),
                `valve_state không hợp lệ: "${data.valve_state}". Phải là OPEN hoặc CLOSED`
            );
        }
    });

    await test("Pipeline: Firebase actuator có control_mode hợp lệ (nếu tồn tại)", async () => {
        const snap = await db.ref("SalinAI/actuator").once("value");
        const data = snap.val();
        if (data?.control_mode) {
            const validModes = ["AUTO", "MANUAL"];
            assert(
                validModes.includes(data.control_mode),
                `control_mode không hợp lệ: "${data.control_mode}". Phải là AUTO hoặc MANUAL`
            );
        }
    });

    await test("Pipeline: action_logs có đúng schema (nếu tồn tại)", async () => {
        const snap = await db
            .ref("SalinAI/action_logs")
            .orderByChild("timestamp")
            .limitToLast(1)
            .once("value");
        const logsMap = snap.val();
        if (logsMap) {
            const latest = Object.values(logsMap)[0];
            assert(typeof latest.action === "string", "action_log thiếu field 'action'");
            assert(typeof latest.reason === "string", "action_log thiếu field 'reason'");
            assert(typeof latest.timestamp !== "undefined", "action_log thiếu field 'timestamp'");
            console.log(`         → Action log cuối: action=${latest.action}, lúc ${latest.timestamp}`);
        } else {
            console.log(`         → Chưa có action_log nào (bình thường khi mới khởi động)`);
        }
    });
}

// ─── Main Runner ─────────────────────────────────────────────────────────────

async function main() {
    console.log("════════════════════════════════════════════════════");
    console.log("  SalinAI — E2E Pipeline Tests (Live Connections)");
    console.log("════════════════════════════════════════════════════");

    // Đợi MongoDB kết nối
    await new Promise(resolve => setTimeout(resolve, 2000));

    await runFirebaseTests();
    await runMongoDBTests();
    await runPipelineTests();

    // ─── Summary ─────────────────────────────────────────────────────────────
    console.log("\n════════════════════════════════════════════════════");
    console.log(`  Kết quả: ${passed} PASS | ${failed} FAIL | Tổng: ${passed + failed}`);
    if (failed === 0) {
        console.log("  🎉 Toàn bộ pipeline ổn định — Sẵn sàng Demo!");
    } else {
        console.log("  ⚠️  Có lỗi cần xử lý trước khi Demo.");
        console.log("\n  Chi tiết lỗi:");
        results
            .filter(r => r.status === "FAIL")
            .forEach(r => console.log(`    - ${r.name}: ${r.error}`));
    }
    console.log("════════════════════════════════════════════════════");

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error("\n[E2E] Fatal error:", err.message);
    process.exit(1);
});
