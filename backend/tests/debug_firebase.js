const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const db = require("../config/firebase");

async function checkFirebaseState() {
    const sensorSnap = await db.ref("SalinAI/sensor_data").once("value");
    const aiStatusSnap = await db.ref("SalinAI/ai_status").once("value");
    const actuatorSnap = await db.ref("SalinAI/actuator_state").once("value");

    console.log("--- FIREBASE CURRENT STATE ---");
    console.log("Sensor Data:", sensorSnap.val());
    console.log("AI Status:", aiStatusSnap.val());
    console.log("Actuator State:", actuatorSnap.val());
    process.exit(0);
}

checkFirebaseState();
