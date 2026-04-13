require('dotenv').config({path: '../.env'});
const { runAgent } = require('../agent/langchain');
const { connectMongoDB } = require('../config/mongodb');

async function test() {
    console.log("Connecting database...");
    await connectMongoDB();
    console.log("Running agent...");
    try {
        await runAgent({
            salinity: 4.5,
            moisture: 65,
            timestamp: new Date().toISOString()
        });
        console.log("Agent finished without crashing!");
    } catch (err) {
        console.error("Agent crashed:", err);
    }
    process.exit(0);
}
test();
