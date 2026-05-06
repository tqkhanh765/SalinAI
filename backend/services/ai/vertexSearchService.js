const { SearchServiceClient } = require('@google-cloud/discoveryengine').v1beta;

const client = new SearchServiceClient({
  projectId: process.env.GOOGLE_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
});

/**
 * querySalinKnowledge
 * Truy xuất kiến thức từ Vertex AI Search Data Store.
 * @param {string} query - Câu hỏi hoặc từ khóa tìm kiếm.
 */
async function querySalinKnowledge(query) {
  const projectId = process.env.GOOGLE_PROJECT_ID;
  const location = process.env.VERTEX_LOCATION || 'global';
  const collectionId = 'default_collection';
  const dataStoreId = process.env.VERTEX_DATA_STORE_ID;
  const servingConfigId = 'default_config';

  if (!dataStoreId) {
    console.warn("[Vertex Search] ⚠️ VERTEX_DATA_STORE_ID chưa được cấu hình.");
    return "Tính năng tra cứu tài liệu chuyên ngành hiện đang được bảo trì.";
  }

  const servingConfig = client.projectLocationCollectionDataStoreServingConfigPath(
    projectId,
    location,
    collectionId,
    dataStoreId,
    servingConfigId
  );

  const request = {
    servingConfig,
    query: query,
    pageSize: 3,
    autoPaginate: false,
    contentSearchSpec: {
      summarySpec: {
        summaryResultCount: 5,
        includeCitations: true
      }
    }
  };

  try {
    const [response] = await client.search(request, { autoPaginate: false });
    
    // Vertex AI Search trả về một tóm tắt tổng hợp (Summary) từ nhiều nguồn
    const answer = response.summary?.summaryText || "Không tìm thấy thông tin cụ thể trong tài liệu chuyên ngành.";
    
    console.log(`[Vertex Search] ✅ Tra cứu thành công cho: "${query}"`);
    return answer;
  } catch (error) {
    console.error('❌ Lỗi Vertex AI Search:', error.message);
    return "Hệ thống tri thức hiện không khả dụng do lỗi kết nối.";
  }
}

module.exports = { querySalinKnowledge };
