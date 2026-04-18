const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");

require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });

const serviceAccountPath = path.resolve(__dirname, "..", "serviceAccountKey.json");

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (error) {
    throw new Error(
      "Invalid FIREBASE_SERVICE_ACCOUNT_JSON. Ensure it is valid JSON from Firebase service account credentials."
    );
  }
} else if (fs.existsSync(serviceAccountPath)) {
  const fileContent = fs.readFileSync(serviceAccountPath, "utf8");
  serviceAccount = JSON.parse(fileContent);
} else {
  throw new Error(
    "Missing Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON and FIREBASE_DATABASE_URL in the deploy environment, or add backend/serviceAccountKey.json for local use."
  );
}

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();

console.log("🔥 Firebase Admin connected successfully!");

module.exports = db;