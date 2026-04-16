require("dotenv").config({ path: '../.env' });
const express = require("express");
const cors = require("cors");

// ─── Firebase Admin (single source of truth) ─────────────────────────────────
const db = require("./config/firebase");

// ─── MongoDB Atlas ────────────────────────────────────────────────────────────
const mongoConfig = require("./config/mongodb");

// ─── Express Setup ────────────────────────────────────────────────────────────
const app = express();

const CORS_ALLOW_ALL_ORIGINS = String(process.env.CORS_ALLOW_ALL_ORIGINS || "false").toLowerCase() === "true";
const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

const envAllowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const allowedOrigins = new Set(envAllowedOrigins);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin and non-browser requests (curl/postman) without Origin header.
      if (!origin) return callback(null, true);
      if (CORS_ALLOW_ALL_ORIGINS) return callback(null, true);
      if (localhostOriginPattern.test(origin)) return callback(null, true);
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
