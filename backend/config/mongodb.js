const { MongoClient } = require('mongodb');

require('dotenv').config({ path: '../.env' }); // Just in case, standard dotenv

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
    database = client.db();
    console.log('[MongoDB] Successfully connected to MongoDB Atlas');
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
  getDb: () => database || (client ? client.db() : null)
};
