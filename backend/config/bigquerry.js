const { BigQuery } = require('@google-cloud/bigquery');

const bigquery = new BigQuery({
  projectId: process.env.GOOGLE_PROJECT_ID,
  // Tự động dùng ADC nếu không có file key
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
});

const datasetId = process.env.BIGQUERY_DATASET_ID || 'salin_ai_data';
const tableId = process.env.BIGQUERY_TABLE_ID || 'sensor_logs';

module.exports = { bigquery, datasetId, tableId };