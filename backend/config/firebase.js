require("dotenv").config();
const admin = require("firebase-admin");

// serviceAccountKey.json lives in /backend/ root — ignored by .gitignore
const serviceAccount = require("../serviceAccountKey.json");

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();

console.log("🔥 Firebase Admin connected successfully!");

module.exports = db;
