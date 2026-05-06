/**
 * Script to test Google Cloud Storage Upload.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { bucket, bucketName } = require('../config/storage');
const fs = require('fs');

async function testUpload() {
  console.log(`\n--- SalinAI Storage Setup ---`);
  console.log(`Bucket: ${bucketName}`);

  // Tạo một file text giả để test nếu chưa có file ảnh
  const testFilePath = path.join(__dirname, 'test-upload.txt');
  fs.writeFileSync(testFilePath, `Test upload from SalinAI at ${new Date().toISOString()}`);

  try {
    console.log(`🚀 Đang upload file lên '${bucketName}'...`);
    
    await bucket.upload(testFilePath, {
      destination: `tests/test-file-${Date.now()}.txt`,
      metadata: {
        contentType: 'text/plain',
      },
    });

    console.log('✅ Upload thành công! Bạn có thể kiểm tra trên Google Cloud Console.');
    
    // Xóa file tạm sau khi test
    fs.unlinkSync(testFilePath);
  } catch (error) {
    console.error('❌ Lỗi Upload:', error.message);
    if (error.message.includes('404')) {
      console.error('👉 Nhắc nhở: Bạn cần tạo Bucket tên là "' + bucketName + '" trên GCP Console trước.');
    }
  }
}

testUpload();
