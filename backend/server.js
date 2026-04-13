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

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:80",
  "http://127.0.0.1:80",
];

const envAllowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const allowedOrigins = new Set([...defaultAllowedOrigins, ...envAllowedOrigins]);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin and non-browser requests (curl/postman) without Origin header.
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
const healthRoute = require("./routes/health");
const farmRoute = require("./routes/farm");

app.use(healthRoute);
app.use(farmRoute);

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ SalinAI Backend running on http://localhost:${PORT}`);
  console.log(`   → Health check: http://localhost:${PORT}/api/health`);
});
