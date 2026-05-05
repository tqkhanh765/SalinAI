/**
 * baseCases.js - Thư viện các mẫu lập luận mẫu (few-shot) cho SalinAI Orchestrator.
 * Giúp Agent duy trì văn phong và logic ra quyết định ổn định.
 * 
 * PHIÊN BẢN: Tối ưu hóa Dynamic Filtering (giảm Token, tăng tốc độ).
 */

const baseCases = [
  {
    id: "normal_safe",
    tags: ["low_salinity", "low_moisture"],
    title: "Tình huống bình thường (Nước ngọt, Đất khô)",
    context: "Salinity: 0.5ppt (Safe), Moisture: 35% (Dry)",
    reasoning: "Đất hiện đang khô (35%) và nước dưới kênh rất an toàn (0.5ppt). Dự báo trời tiếp tục nắng nên cần mở van cấp nước ngay lập tức để duy trì sinh trưởng.",
    action: "OPEN"
  },
  {
    id: "rain_trap",
    tags: ["rain", "stable_moisture"],
    title: "Bẫy nước ngọt (Nước ngọt, Sắp mưa)",
    context: "Salinity: 0.8ppt (Safe), Moisture: 45% (Stable), Rainfall: >20mm forecast",
    reasoning: "Nước hiện tại an toàn để tưới, tuy nhiên độ ẩm đất vẫn ở mức ổn định (45%). Do dự báo sắp có mưa to, việc mở van lúc này là lãng phí tài nguyên và có nguy cơ gây ngập úng.",
    action: "CLOSED"
  },
  {
    id: "double_disaster",
    tags: ["mild_salinity", "critical_moisture"],
    title: "Hạn Mặn Kép (Đánh đổi sinh tử)",
    context: "Salinity: 1.5ppt (Mild Over), Moisture: 20% (Critical Dry)",
    reasoning: "Đất đang khô hạn mức nguy kịch (20%), cây có nguy cơ chết héo. Dù nước đang nhiễm mặn nhẹ (vượt ngưỡng 0.5ppt), nhưng cứu hạn lúc này quan trọng hơn chống mặn. Cần mở van khẩn cấp và sẽ đóng lại ngay khi đất đạt 40% ẩm.",
    action: "OPEN"
  },
  {
    id: "danger_salinity",
    tags: ["high_salinity"],
    title: "Mặn nguy hiểm (Nước mặn cao, Đất khô)",
    context: "Salinity: 3.5ppt (Danger), Moisture: 30% (Dry)",
    reasoning: "Đất đang thiếu nước, nhưng độ mặn hiện tại đã vượt mức an toàn rất cao (vượt 2.5ppt). Việc bơm nước lúc này sẽ bơm thẳng muối vào ruộng làm chết rễ lúa. Bắt buộc đóng van và chờ nước ngọt hơn.",
    action: "CLOSED"
  },
  {
    id: "recovery_safe",
    tags: ["low_salinity", "recovery"],
    title: "Hồi phục sau mặn",
    context: "Salinity: 0.4ppt (Safe), Moisture: 40% (Safe)",
    reasoning: "Nguồn nước đã ngọt trở lại sau đợt mặn. Dù độ ẩm đất đang ở mức an toàn (40%), tôi vẫn quyết định mở van để thau rửa lượng muối còn sót lại trong đất, giúp rễ cây hồi phục nhanh hơn.",
    action: "OPEN"
  },
  {
    id: "proactive_storage",
    tags: ["proactive", "low_salinity"],
    title: "Chủ động tích trữ trước thiên tai",
    context: "Moisture: 50% (Safe), Salinity: 0.2ppt (Sweet), Forecast: Salinity > 4.0ppt tomorrow",
    reasoning: "Độ ẩm ruộng hiện tại đang ở mức ổn định (50%), nhưng dự báo ngày mai mặn sẽ xâm nhập rất sâu. Tranh thủ lúc nước dưới kênh còn đang ngọt lịm (0.2ppt), cần mở van ngay để tích trữ nước ngọt tối đa vào nội đồng, giúp cây có nguồn dự trữ chống chọi với đợt mặn sắp tới.",
    action: "OPEN"
  },
  {
    id: "leaching_after_salinity",
    tags: ["recovery", "wet"],
    title: "Thau chua rửa mặn sau thiên tai",
    context: "Moisture: 70% (Wet), Salinity: 0.1ppt (Sweet), History: Recent long salinity event",
    reasoning: "Ruộng đang ngập nước (ẩm 70%) nhưng nước dưới kênh hiện đã ngọt trở lại (0.1ppt). Đây là cơ hội vàng để mở van xả tràn, dùng nước ngọt thau chua rửa mặn cho đồng ruộng, giúp làm loãng độc chất và phục hồi rễ lúa sau đợt mặn vừa qua.",
    action: "OPEN"
  },
  {
    id: "ripening_drainage",
    tags: ["harvest"],
    title: "Lúa giai đoạn chín/chuẩn bị thu hoạch",
    context: "Moisture: 35% (Dry), Salinity: 0.1ppt (Sweet), Stage: Ripening",
    reasoning: "Nước kênh đang rất ngọt, nhưng lúa đã bước vào giai đoạn chín, chuẩn bị thu hoạch. Giai đoạn này bắt buộc phải siết nước, giữ ruộng khô chân để hạt lúa sáng mẩy, dễ thu hoạch bằng máy và tránh đổ ngã. Tuyệt đối không bơm thêm nước dù đất đang khô.",
    action: "CLOSED"
  },
  {
    id: "rain_dilution",
    tags: ["rain", "high_salinity"],
    title: "Tận dụng nước trời để hạ mặn",
    context: "Moisture: 40% (Dryish), Salinity: 4.5ppt (Danger), Forecast: Heavy Rain",
    reasoning: "Nước kênh đang nhiễm mặn mức nguy hiểm (4.5ppt), tuyệt đối không được dùng để bơm. Tuy nhiên, dự báo đang có mưa to. Cần giữ van đóng kín để ngăn nước mặn bên ngoài tràn vào, đồng thời giữ lại toàn bộ lượng nước mưa quý giá này trong ruộng để tự pha loãng độ mặn của đất.",
    action: "CLOSED"
  },
  {
    id: "sensor_error",
    tags: ["error"],
    title: "Lỗi cảm biến / Out of bounds",
    context: "Moisture: 150% (Invalid), Salinity: -2.0ppt (Negative error)",
    reasoning: "Dữ liệu cảm biến trả về các con số phi vật lý (ẩm vượt 100%, mặn số âm). Đây là dấu hiệu phần cứng hoặc kết nối mạng bị chập mạch. Để đảm bảo an toàn tối đa và tránh đưa ra quyết định sai lệch làm hỏng vụ mùa, hệ thống sẽ chặn mọi can thiệp và kích hoạt chế độ an toàn.",
    action: "NO_ACTION"
  }
];

/**
 * Chuyển đổi mảng các cases thành chuỗi văn bản dùng cho prompt.
 * Có lọc thông minh dựa trên sensorData để giảm Token.
 */
function getFewShotBlock(sensorData = {}) {
  const { salinity, moisture, crop_stage, external_forecast } = sensorData;
  const rainfall = Number(external_forecast?.rainfall_24h || 0);
  
  // 1. Xác định tag cần thiết
  const activeTags = new Set();
  
  if (salinity < 0 || moisture > 100 || moisture < 0) activeTags.add("error");
  if (salinity > 2.0) activeTags.add("high_salinity");
  if (salinity > 0.8 && salinity <= 2.0) activeTags.add("mild_salinity");
  if (salinity <= 0.8) activeTags.add("low_salinity");
  
  if (moisture < 25) activeTags.add("critical_moisture");
  if (moisture < 40) activeTags.add("low_moisture");
  
  if (rainfall > 10) activeTags.add("rain");
  
  const stage = String(crop_stage || "").toUpperCase();
  if (stage === "HARVEST" || stage === "RIPENING") activeTags.add("harvest");

  // 2. Lọc các cases khớp với tags
  let filteredCases = baseCases.filter(c => 
    c.tags.some(tag => activeTags.has(tag))
  );

  // 3. Nếu ít quá thì lấy thêm kịch bản bình thường hoặc lỗi
  if (filteredCases.length < 2) {
    filteredCases = [...filteredCases, ...baseCases.filter(c => c.id === "normal_safe" || c.id === "sensor_error")];
  }

  // 4. Giới hạn tối đa 3 ví dụ để tiết kiệm Token
  const finalCases = [...new Set(filteredCases)].slice(0, 3);

  let block = "[MẪU LẬP LUẬN BẮT BUỘC - FEW-SHOT EXAMPLES]\n";
  block += "Dưới đây là các ví dụ về cách bạn PHẢI lập luận trong tình huống TƯƠNG TỰ:\n\n";

  finalCases.forEach((c, index) => {
    block += `Ví dụ ${index + 1} (${c.title}):\n`;
    block += `- Lập luận: "${c.reasoning}"\n`;
    block += `- Quyết định chốt: Gọi tool với state="${c.action}"\n\n`;
  });

  return block;
}

module.exports = { baseCases, getFewShotBlock };
