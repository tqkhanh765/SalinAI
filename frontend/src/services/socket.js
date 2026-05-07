/**
 * SOCKET SERVICE (Frontend)
 * 
 * Tác dụng: Kết nối với Backend qua Socket.io để nhận Token AI theo thời gian thực.
 */

import { io } from "socket.io-client";

const getBackendUrl = () => {
  if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
  
  // Dynamic detection: if frontend is on localhost:5173, backend is on localhost:3001
  // If frontend is on 192.168.1.5:5173, backend is on 192.168.1.5:3001
  const host = window.location.hostname;
  return `http://${host}:3001`;
};

const SOCKET_URL = getBackendUrl();

let socket = null;

export const initSocket = () => {
  if (!socket) {
    console.log("🔌 [Socket] Attempting connection to:", SOCKET_URL);
    socket = io(SOCKET_URL, {
      transports: ["websocket"],
      reconnection: true
    });

    socket.on("connect", () => {
      console.log("🔌 [Socket] Connected to backend:", socket.id);
    });

    socket.on("connect_error", (err) => {
      console.error("🔌 [Socket] Connection Error:", err.message);
    });

    socket.on("disconnect", () => {
      console.log("🔌 [Socket] Disconnected from backend");
    });
  }
  return socket;
};

export const getSocket = () => {
  if (!socket) return initSocket();
  return socket;
};

export const onAiToken = (callback) => {
  const s = getSocket();
  s.on("ai_token", callback);
  return () => s.off("ai_token", callback);
};

export const onAiStatus = (callback) => {
  const s = getSocket();
  s.on("ai_status", callback);
  return () => s.off("ai_status", callback);
};
