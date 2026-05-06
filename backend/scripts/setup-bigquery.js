/**
 * Script to setup BigQuery Dataset and Table for SalinAI.
 * Run this once to ensure your GCP project is ready to receive data.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { BigQuery } = require('@google-cloud/bigquery');

async function setupBigQuery() {
  const bigquery = new BigQuery({
    projectId: process.env.GOOGLE_PROJECT_ID,
    keyFilename: path.resolve(__dirname, '../', 'serviceAccountKey.json'),
  });

  const datasetId = process.env.BIGQUERY_DATASET_ID || 'salin_ai_data';
  const tableId = process.env.BIGQUERY_TABLE_ID || 'sensor_logs';

  console.log(`\n--- SalinAI BigQuery Setup ---`);
  console.log(`Project: ${process.env.GOOGLE_PROJECT_ID}`);

  try {
    // 1. Create Dataset if not exists
    const [datasets] = await bigquery.getDatasets();
    const datasetExists = datasets.some(d => d.id === datasetId);

    if (!datasetExists) {
      await bigquery.createDataset(datasetId, { location: 'asia-southeast1' });
      console.log(`✅ Dataset '${datasetId}' created.`);
    } else {
      console.log(`ℹ️ Dataset '${datasetId}' already exists.`);
    }

    // 2. Create Table if not exists
    const dataset = bigquery.dataset(datasetId);
    const [tables] = await dataset.getTables();
    const tableExists = tables.some(t => t.id === tableId);

    const schema = [
      { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
      { name: 'salinity', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'moisture', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'river_water_level', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'temperature', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'humidity', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'crop_stage', type: 'STRING', mode: 'NULLABLE' },
      { name: 'ai_action', type: 'STRING', mode: 'NULLABLE' },
      { name: 'trigger_reason', type: 'STRING', mode: 'NULLABLE' },
    ];

    if (!tableExists) {
      await dataset.createTable(tableId, { schema, location: 'asia-southeast1' });
      console.log(`✅ Table '${tableId}' created.`);
    } else {
      console.log(`ℹ️ Table '${tableId}' already exists.`);
    }

    // 3. Insert Test Row
    console.log(`\n--- Sending Test Row ---`);
    const testRow = {
      timestamp: new Date().toISOString(),
      salinity: 0.5,
      moisture: 45.2,
      river_water_level: 1.2,
      temperature: 28.5,
      humidity: 80,
      crop_stage: 'VEGETATIVE',
      ai_action: 'TEST_SUCCESS',
      trigger_reason: 'SETUP_SCRIPT'
    };

    await dataset.table(tableId).insert([testRow]);
    console.log(`🚀 Test row inserted successfully! Check your BigQuery console.`);

  } catch (error) {
    console.error(`\n❌ Error setting up BigQuery:`);
    console.error(error.message);
    if (error.errors) {
      console.error(JSON.stringify(error.errors, null, 2));
    }
  }
}

setupBigQuery();
