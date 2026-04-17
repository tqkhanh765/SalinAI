#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <LiquidCrystal_I2C.h>
#include "DHTesp.h"

#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

// ─── Backend & Database URLs ─────────────────────────────────────────────────
String backendURL = "https://salinai.onrender.com/api/ingest";
String rtdbURL = "https://salin-ai-hackathon-default-rtdb.asia-southeast1.firebasedatabase.app";

// ─── Hardware Initialization ─────────────────────────────────────────────────
LiquidCrystal_I2C lcd(0x27, 20, 4);
DHTesp dht;
WiFiClientSecure client;

#define VALVE_LED_PIN 2

// ─── Timing & Anomaly Thresholds ─────────────────────────────────────────────
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 300000; // 5 phút
const float SAL_THRESHOLD  = 0.5;
const float MOIS_THRESHOLD = 10.0;

// ─── State Tracking ──────────────────────────────────────────────────────────
float lastSalinity  = -1.0;
float lastMoisture  = -1.0;
String currentAction = "OPEN";

// ─── KỊCH BẢN DEMO 5 PHÚT (20 steps, mỗi step 15 giây) ──────────────────────
const int TOTAL_STEPS = 20;
int currentStep = 0;

// Mảng Dữ liệu (4 giá trị = 1 Phút)
const float mock_salinity[TOTAL_STEPS] = {
  // Phút 0-1: Bình thường
  0.4, 0.4, 0.4, 0.4, 
  // Phút 1-2: Đột biến mặn -> Trigger đóng van
  2.6, 2.6, 2.6, 2.6,
  // Phút 2-3: Vẫn mặn
  2.6, 2.6, 2.6, 2.6,
  // Phút 3-4: Nước ngọt trở lại -> Trigger mở van
  0.3, 0.3, 0.3, 0.3,
  // Phút 4-5: Ổn định
  0.3, 0.3, 0.3, 0.3
};

const float mock_moisture[TOTAL_STEPS] = {
  // Phút 0-1: Đất ẩm
  65.0, 65.0, 65.0, 65.0,
  // Phút 1-2: Van đóng, đất bắt đầu khô dần
  63.0, 60.0, 57.0, 54.0,
  // Phút 2-3: Khô hạn nghiêm trọng -> Trigger báo động khô rễ
  45.0, 45.0, 45.0, 45.0,
  // Phút 3-4: Van mở, độ ẩm phục hồi
  50.0, 55.0, 60.0, 63.0,
  // Phút 4-5: Đất ẩm lại như cũ
  65.0, 65.0, 65.0, 65.0
};

const float mock_flow[TOTAL_STEPS] = {
  // Phút 0-1: Đang tưới
  25.0, 25.0, 25.0, 25.0,
  // Phút 1-2: AI đóng van -> Nước ngừng chảy
  0.0, 0.0, 0.0, 0.0,
  // Phút 2-3: Van vẫn đóng
  0.0, 0.0, 0.0, 0.0,
  // Phút 3-4: AI mở van -> Tưới lại
  25.0, 25.0, 25.0, 25.0,
  // Phút 4-5: Đang tưới
  25.0, 25.0, 25.0, 25.0
};
// ─────────────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);

  lcd.init();
  lcd.backlight();
  pinMode(VALVE_LED_PIN, OUTPUT);

  lcd.setCursor(0, 0);
  lcd.print("Connecting Wi-Fi...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");

  client.setInsecure();

  lcd.clear();
  lcd.print("SalinAI Online!");
  delay(1000);
}

void sendToBackend(float sal, float mois, float flow, String triggerType) {
  client.setInsecure();
  HTTPClient http;
  http.begin(client, backendURL);
  http.addHeader("Content-Type", "application/json");

  String json = "{";
  json += "\"salinity\":" + String(sal, 2) + ",";
  json += "\"moisture\":" + String(mois, 1) + ",";
  json += "\"water_flow\":" + String(flow, 1);
  json += "}";

  Serial.println("[HTTP] POST -> " + json);
  int code = http.POST(json);

  if (code > 0) {
    Serial.printf("[HTTP] Backend OK: %d\n", code);
  } else {
    Serial.printf("[HTTP] Backend Error: %s\n", http.errorToString(code).c_str());
  }
  http.end();
}

void fetchActuatorState() {
  client.setInsecure();
  HTTPClient http;
  http.begin(client, rtdbURL + "/actuator/valve_state.json");
  int code = http.GET();
  if (code > 0) {
    String payload = http.getString();
    payload.replace("\"", "");
    if (payload == "CLOSE" || payload == "OPEN") {
      currentAction = payload;
    }
  }
  http.end();
}

void loop() {
  static unsigned long lastRead = 0;

  // Thực thi 1 step mỗi 15 giây
  if (millis() - lastRead > 15000) {
    lastRead = millis();

    float salinity     = mock_salinity[currentStep];
    float soilMoisture = mock_moisture[currentStep];
    float waterFlow    = mock_flow[currentStep];

    bool isAnomaly = false;
    String triggerType = "";

    // Thuật toán phát hiện biến động đột ngột
    if (lastSalinity < 0 || (millis() - lastHeartbeat > HEARTBEAT_INTERVAL)) {
      isAnomaly  = true;
      triggerType = "HEARTBEAT";
      lastHeartbeat = millis();
    }
    else if (abs(salinity - lastSalinity) >= SAL_THRESHOLD) {
      isAnomaly  = true;
      triggerType = "SAL_SPIKE";
    } 
    else if (abs(soilMoisture - lastMoisture) >= MOIS_THRESHOLD) {
      isAnomaly  = true;
      triggerType = "MOIS_DROP";
    }

    if (isAnomaly) {
      Serial.printf("\n>>> [Step %d] Triggering push (%s)...\n", currentStep, triggerType.c_str());
      sendToBackend(salinity, soilMoisture, waterFlow, triggerType);
      lastSalinity = salinity;
      lastMoisture = soilMoisture;
    }

    // Tăng bước kịch bản
    currentStep++;
    if (currentStep >= TOTAL_STEPS) {
      Serial.println("\n--- HOÀN TẤT DEMO 5 PHÚT. CHẠY LẠI TỪ ĐẦU ---");
      currentStep = 0;     
      lastSalinity = -1.0; // Ép gửi HEARTBEAT ở vòng lặp mới
    }

    fetchActuatorState();

    if (currentAction == "CLOSE") {
      digitalWrite(VALVE_LED_PIN, HIGH);
    } else {
      digitalWrite(VALVE_LED_PIN, LOW);
    }

    // Cập nhật giao diện LCD
    char lcdBuf[21];
    
    snprintf(lcdBuf, sizeof(lcdBuf), "Sal:%.1fg Flw:%.0f  ", salinity, waterFlow);
    lcd.setCursor(0, 0); lcd.print(lcdBuf);

    snprintf(lcdBuf, sizeof(lcdBuf), "M:%.0f%% V:%-5s   ", soilMoisture, currentAction.c_str());
    lcd.setCursor(0, 1); lcd.print(lcdBuf);
    
    lcd.setCursor(0, 2); lcd.print("Status: Cloud Sync ");
    snprintf(lcdBuf, sizeof(lcdBuf), "Evt: %-14s", triggerType == "" ? "IDLE" : triggerType.c_str());
    lcd.setCursor(0, 3); lcd.print(lcdBuf);
  }
}