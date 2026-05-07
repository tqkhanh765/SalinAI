/**
 * TEST SOCKET STREAMING
 * 
 * Tác dụng: Kết nối vào Socket.io của Backend và in ra các Token nhận được.
 * Dùng để kiểm tra xem tính năng Streaming có thực sự hoạt động hay không.
 */

const { io } = require("socket.io-client");

const socket = io("http://localhost:3001", {
    transports: ["websocket"]
});

console.log("⏳ [Test] Đang kết nối tới http://localhost:3001...");

socket.on("connect", () => {
    console.log("✅ [Test] Đã kết nối thành công! (ID: " + socket.id + ")");
    console.log("   -> Đang chờ nhận AI Tokens... (Hãy kích hoạt AI bằng cách thay đổi độ mặn)");
});

socket.on("ai_status", (data) => {
    console.log("\n[STATUS]:", data);
});

socket.on("ai_token", (data) => {
    process.stdout.write(data.token); // In từng chữ một
});

socket.on("disconnect", () => {
    console.log("\n❌ [Test] Mất kết nối.");
});

// Tự động ngắt sau 60s
setTimeout(() => {
    console.log("\n[Test] Kết thúc 60s nghe thử.");
    process.exit();
}, 60000);
