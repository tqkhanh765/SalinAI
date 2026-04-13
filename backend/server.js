require("dotenv").config({ path: '../.env' });
const express = require("express");
const cors = require("cors");

// ─── Firebase Admin (single source of truth) ─────────────────────────────────
const db = require("./config/firebase");

// ─── MongoDB Atlas ────────────────────────────────────────────────────────────
const mongoConfig = require("./config/mongodb");

// ─── Firebase Listener (Agent Trigger) ───────────────────────────────────────
const { startListener } = require("./listeners/firebase-listener");
startListener();

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
const healthRoute = require("./routes/health");

app.use(healthRoute);

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ SalinAI Backend running on http://localhost:${PORT}`);
  console.log(`   → Health check: http://localhost:${PORT}/api/health`);
});
