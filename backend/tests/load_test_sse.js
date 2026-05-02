const { EventSource } = require('eventsource');

console.log("🚀 Bắt đầu Load Test Server-Sent Events (SSE) với 5 Clients đồng thời...");

const url = 'http://localhost:3001/api/farm-stream';
const numClients = 5;
let clients = [];
let messagesReceived = 0;

for (let i = 0; i < numClients; i++) {
    const es = new EventSource(url);
    
    es.onopen = () => {
        console.log(`[Client ${i+1}] Đã kết nối SSE.`);
    };

    es.onmessage = (event) => {
        messagesReceived++;
    };

    es.onerror = (err) => {
        console.log(`[Client ${i+1}] Lỗi kết nối hoặc server ngắt dòng.`);
    };

    clients.push(es);
}

// Chạy test trong 10 giây
setTimeout(() => {
    console.log("-----------------------------------------");
    console.log(`✅ Hoàn thành Load Test sau 10 giây.`);
    console.log(`📊 Tổng số tin nhắn SSE nhận được từ 5 clients: ${messagesReceived}`);
    console.log("Đóng toàn bộ kết nối.");
    clients.forEach(c => c.close());
    process.exit(0);
}, 10000);
