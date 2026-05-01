/**
 * SOCKET SERVICE
 * 
 * Tác dụng: Quản lý kết nối Socket.io toàn cục.
 * Cho phép các tác tử AI đẩy Token (streaming) về Frontend theo thời gian thực.
 */

const { Server } = require("socket.io");

let io = null;

/**
 * Initialize Socket.io with an HTTP server
 */
function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*", // In production, refine this to match your FRONTEND_URL
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log(`🔌 [Socket] New client connected: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`🔌 [Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

/**
 * Get the global IO instance
 */
function getIO() {
  if (!io) {
    // console.warn("[Socket] Warning: IO not initialized yet.");
    return null;
  }
  return io;
}

/**
 * Emit a streaming token to a specific room or globally
 */
function emitToken(token, phase = "orchestrator") {
  if (io) {
    io.emit("ai_token", { token, phase });
  }
}

/**
 * Emit a phase start/end signal
 */
function emitAiStatus(status, metadata = {}) {
  if (io) {
    io.emit("ai_status", { status, ...metadata });
  }
}

module.exports = {
  initSocket,
  getIO,
  emitToken,
  emitAiStatus
};
