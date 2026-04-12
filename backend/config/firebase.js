require("dotenv").config();
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

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
  // serviceAccountKey.json lives in /backend/ root — ignored by .gitignore
  serviceAccount = require("../serviceAccountKey.json");
} else {
  throw new Error(
    "Missing Firebase credentials. Add backend/serviceAccountKey.json or set FIREBASE_SERVICE_ACCOUNT_JSON in root .env"
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
