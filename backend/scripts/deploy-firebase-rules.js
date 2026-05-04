/**
 * deploy-firebase-rules.js
 *
 * Deploys database.rules.json to Firebase Realtime Database via REST API.
 * Uses the service account to get an access token, then PUTs the rules.
 *
 * Run: node scripts/deploy-firebase-rules.js
 */

const path = require("path");
const fs = require("fs");
const https = require("https");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { GoogleAuth } = require("google-auth-library");

async function deployRules() {
    console.log("🔐 Đang xác thực với Google...");

    const serviceAccountPath = path.resolve(__dirname, "../serviceAccountKey.json");

    let credentials;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else if (fs.existsSync(serviceAccountPath)) {
        credentials = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    } else {
        throw new Error("Không tìm thấy serviceAccountKey.json");
    }

    const auth = new GoogleAuth({
        credentials,
        scopes: [
            "https://www.googleapis.com/auth/firebase",
            "https://www.googleapis.com/auth/cloud-platform"
        ]
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    // Read rules file
    const rulesPath = path.resolve(__dirname, "../../database.rules.json");
    const rulesContent = fs.readFileSync(rulesPath, "utf8");
    const rules = JSON.parse(rulesContent);

    // Firebase project ID from service account
    const projectId = credentials.project_id;
    const databaseId = process.env.FIREBASE_DATABASE_URL
        .replace("https://", "")
        .replace(/\/$/, "");

    console.log(`📋 Project: ${projectId}`);
    console.log(`🔥 Database: ${databaseId}`);
    console.log("📤 Đang deploy rules...\n");

    // PUT rules via REST API
    const body = JSON.stringify(rules.rules);
    const options = {
        hostname: databaseId,
        path: "/.settings/rules.json",
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
        }
    };

    await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                if (res.statusCode === 200) {
                    console.log("✅ Rules deployed thành công!");
                    console.log("\n📊 Rules đã áp dụng:");
                    console.log("  - SalinAI/action_logs: .indexOn [\"timestamp\"] ← Xóa WARNING");
                    console.log("  - Tất cả 6 paths SalinAI/* đã được khai báo tường minh");
                    resolve();
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on("error", reject);
        req.write(body);
        req.end();
    });

    process.exit(0);
}

deployRules().catch(err => {
    console.error("❌ Deploy thất bại:", err.message);
    process.exit(1);
});
