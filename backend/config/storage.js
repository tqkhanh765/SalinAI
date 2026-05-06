const { Storage } = require('@google-cloud/storage');
const path = require('path');

const storage = new Storage({
  projectId: process.env.GOOGLE_PROJECT_ID,
  // Tự động dùng ADC nếu không có file key
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
});

const bucketName = process.env.GCS_BUCKET_NAME || 'salinai-storage-bucket';
const bucket = storage.bucket(bucketName);

module.exports = { storage, bucket, bucketName };
