const path = require('path');
const { MongoClient } = require('mongodb');

require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') }); // Resolve the repo root .env consistently

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('[MongoDB] WARNING: MONGODB_URI is not defined in environment variables. Vector search features will fail.');
}

// We will attempt connection only if uri is present, else it doesn't crash but logs warning
// so app can still boot for Firebase-only scope if missing locally.
const client = uri ? new MongoClient(uri) : null;
let database = null;

async function connectMongoDB() {
  if (!client) return null;
  try {
    await client.connect();
    database = client.db("salinai");
    console.log('[MongoDB] Successfully connected to MongoDB Atlas');

    // MONGODB OPTIMIZATION: Ensure indexes exist for fast retrieval
    try {
      await database.collection("sensor_history").createIndex({ timestamp: -1 });
      await database.collection("action_logs").createIndex({ "prediction.evaluated_at": -1 });
    } catch (idxError) {
      console.error('[MongoDB] Warning: Failed to ensure indexes:', idxError.message);
    }

    return database;
  } catch (error) {
    console.error('[MongoDB] Connection failed:', error.message);
    // Not calling process.exit(1) to allow fallback when mongodb string is bad during setup
    return null;
  }
}

// Validate startup connectivity
if (client) {
    connectMongoDB();
}

module.exports = {
  client,
  connectMongoDB,
  getDb: () => database || (client ? client.db("salinai") : null)
};
