require("dotenv").config();
const express = require("express");
const cors = require("cors");

// ─── Firebase Admin (single source of truth) ─────────────────────────────────
const db = require("./config/firebase");

// ─── Express Setup ────────────────────────────────────────────────────────────
const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/health
 * Confirms the server is running and Firebase Admin SDK is connected.
 */
app.get("/api/health", async (req, res) => {
  try {
    const snapshot = await db.ref(".info/connected").once("value");
    const firebaseConnected = snapshot.val();

    res.status(200).json({
      status: "OK",
      timestamp: new Date().toISOString(),
      firebase: firebaseConnected ? "CONNECTED" : "DISCONNECTED",
    });
  } catch (error) {
    console.error("[Health Check] Firebase error:", error.message);
    res.status(500).json({
      status: "ERROR",
      message: error.message,
    });
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ SalinAI Backend running on http://localhost:${PORT}`);
  console.log(`   → Health check: http://localhost:${PORT}/api/health`);
});
