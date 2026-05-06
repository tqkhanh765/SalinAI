/**
 * Script to LIST all available Data Stores in the project.
 */
const { DataStoreServiceClient } = require('@google-cloud/discoveryengine').v1beta;
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const client = new DataStoreServiceClient({
  projectId: process.env.GOOGLE_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
});

async function listDataStores() {
  const projectId = process.env.GOOGLE_PROJECT_ID;
  const location = process.env.VERTEX_LOCATION || 'global';
  const collectionId = 'default_collection';

  console.log(`\n--- SalinAI Data Store Scanner ---`);
  console.log(`Project: ${projectId}`);
  console.log(`Location: ${location}\n`);

  const parent = `projects/${projectId}/locations/${location}/collections/${collectionId}`;

  try {
    // Note: This is a manual path construction as the library might vary
    const [dataStores] = await client.listDataStores({ parent });
    
    if (dataStores.length === 0) {
      console.log(`❌ Không tìm thấy Data Store nào ở vùng "${location}".`);
      console.log(`👉 Thử kiểm tra các vùng khác (us, eu)?`);
    } else {
      console.log(`✅ Tìm thấy ${dataStores.length} Data Store:`);
      dataStores.forEach(ds => {
        // Trích xuất ID từ name (projects/.../dataStores/ID)
        const id = ds.name.split('/').pop();
        console.log(`- Tên: ${ds.displayName}`);
        console.log(`  ID: ${id}`);
        console.log(`  Path: ${ds.name}\n`);
      });
    }
  } catch (error) {
    console.error('❌ Lỗi khi liệt kê Data Stores:', error.message);
  }
}

listDataStores();
