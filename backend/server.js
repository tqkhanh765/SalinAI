/** SALINAI_RESTART_TRIGGER: 2026-05-04 00:30
 * Backend application entrypoint.
 * Bootstraps Express, connects shared services, and mounts routes that power the farm APIs and AI pipeline.
 * Now includes Socket.io for real-time AI streaming.
 */
const path = require("path");
const http = require("http");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const express = require("express");
const cors = require("cors");

// ─── Firebase Admin ───────────────────────────────────────────────────────────
const db = require("./config/firebase");

// ─── MongoDB Atlas ────────────────────────────────────────────────────────────
const mongoConfig = require("./config/mongodb");

// ─── Socket.io Service ────────────────────────────────────────────────────────
const { initSocket } = require("./services/core/socketService");

// ─── Express Setup ────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

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
const { startAutoLearningScheduler } = require("./services/ai/autoLearningScheduler");
const { startFirebaseWatcher } = require("./services/core/farmFirebaseWatcher");
const { startProactivePlanningScheduler, checkAndTriggerStartupPlanning } = require("./services/ai/proactivePlanningService");

app.use(healthRoute);
app.use(farmRoute);

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`✅ SalinAI Backend running on http://localhost:${PORT}`);
  console.log(`   → Real-time Streaming (Socket.io) enabled`);
  console.log(`   → Health check: http://localhost:${PORT}/api/health`);

  startAutoLearningScheduler();
  startFirebaseWatcher();
  startProactivePlanningScheduler();
  checkAndTriggerStartupPlanning();
});
