#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <LiquidCrystal_I2C.h>
#include "DHTesp.h"

#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

// ─── Timeouts ────────────────────────────────────────────────────────────────
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;  // 15 sec for Wi-Fi
const unsigned long HTTP_TIMEOUT_MS = 20000;          // 20 sec for HTTP requests (Chống lỗi Cold Start trên Render)

// ─── Backend URL (Deployed on Render) ────────────────────────────────────────
String backendURL = "https://salinai.onrender.com/api/ingest";

// Firebase RTDB (for low-latency actuator state reads only)
String rtdbURL = "https://salin-ai-hackathon-default-rtdb.asia-southeast1.firebasedatabase.app";

LiquidCrystal_I2C lcd(0x27, 20, 4);
DHTesp dht;
WiFiClientSecure client;

#define DHT_PIN 15
#define SALINITY_PIN 34
#define SOIL_MOISTURE_PIN 35
#define WATER_FLOW_PIN 32
#define VALVE_LED_PIN 2

// ─── Timing & Anomaly Thresholds ─────────────────────────────────────────────
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 300000; // 5 minutes
const float SAL_THRESHOLD  = 0.5;
const float MOIS_THRESHOLD = 10.0;

// ─── State Tracking ──────────────────────────────────────────────────────────
float lastSalinity  = -1.0;
float lastMoisture  = -1.0;
String currentAction = "OPEN";
unsigned long lastFetchActuator = 0;
const unsigned long FETCH_ACTUATOR_INTERVAL = 30000;  // Fetch every 30 sec

bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    return true;
  }
  
  Serial.println("\nWiFi timeout or failed.");
  return false;
}

void setup() {
  Serial.begin(115200);

  lcd.init();
  lcd.backlight();
  pinMode(VALVE_LED_PIN, OUTPUT);
  dht.setup(DHT_PIN, DHTesp::DHT22);

  lcd.setCursor(0, 0);
  lcd.print("Connecting Wi-Fi...");

  bool wifi_ok = connectWiFi();

  // Bypass SSL cert verification (required for Wokwi HTTPS)
  client.setInsecure();
  client.setTimeout(HTTP_TIMEOUT_MS);

  lcd.clear();
  if (wifi_ok) {
    lcd.print("SalinAI Online!");
  } else {
    lcd.print("Offline Mode");
  }
  delay(1000);
}

// ─── POST sensor data to Backend /api/ingest ─────────────────────────────────
void sendToBackend(float sal, float mois, String triggerType) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Ingest] Wi-Fi disconnected, skipping POST.");
    return;
  }
  
  // Gọi Insecure ngay trước khi request
  client.setInsecure();

  HTTPClient http;
  // Chỉ sử dụng setTimeout, đã gỡ bỏ setReadTimeout và setConnectTimeout để không bị lỗi build
  http.setTimeout(HTTP_TIMEOUT_MS); 
  
  if (!http.begin(client, backendURL)) {
    Serial.println("[Ingest] Failed to begin HTTP connection.");
    http.end();
    return;
  }
  
  http.addHeader("Content-Type", "application/json");
  http.addHeader("User-Agent", "ESP32-SalinAI"); 

  // Đã sửa lại key json về "salinity" và "moisture" để tránh lỗi 400 từ backend
  String json = "{";
  json += "\"salinity\":" + String(sal, 2) + ",";
  json += "\"moisture\":" + String(mois, 1) + ",";
  json += "\"crop_stage\":\"VEGETATIVE\"";
  json += "}";

  Serial.println("[Ingest] POST -> " + json);
  int code = http.POST(json);

  if (code > 0) {
    Serial.printf("[Ingest] Backend OK: %d\n", code);
    String response = http.getString();
    if (response.length() > 0) {
      Serial.println("[Ingest] Response: " + response.substring(0, 100));
    }
  } else {
    Serial.printf("[Ingest] Backend Error: %s\n", http.errorToString(code).c_str());
  }
  
  http.end();
}

// ─── Read actuator valve state from Firebase /actuator ───────────────────────
void fetchActuatorState() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Actuator] Wi-Fi disconnected, skipping fetch.");
    return;
  }
  
  client.setInsecure();

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS); 
  
  if (!http.begin(client, rtdbURL + "/actuator/valve_state.json")) {
    Serial.println("[Actuator] Failed to begin HTTP connection.");
    http.end();
    return;
  }
  
  int code = http.GET();
  if (code == 200) {
    String payload = http.getString();
    payload.trim();
    payload.replace("\"", "");
    
    // Đã sửa "CLOSE" thành "CLOSED"
    if (payload == "CLOSED" || payload == "OPEN") {
      currentAction = payload;
      Serial.printf("[Actuator] Updated to: %s\n", currentAction.c_str());
    } else {
      Serial.printf("[Actuator] Invalid payload: %s\n", payload.c_str());
    }
  } else if (code > 0) {
    Serial.printf("[Actuator] HTTP %d\n", code);
  } else {
    Serial.printf("[Actuator] Error: %s\n", http.errorToString(code).c_str());
  }
  
  http.end();
}

void loop() {
  static unsigned long lastRead = 0;

  // Reconnect Wi-Fi if disconnected
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Read sensors every 5 seconds
  if (millis() - lastRead > 5000) {
    lastRead = millis();

    float salinity     = (analogRead(SALINITY_PIN)      / 4095.0) * 5.0;
    float soilMoisture = (analogRead(SOIL_MOISTURE_PIN) / 4095.0) * 100.0;

    bool isAnomaly = false;
    String triggerType = "";

    // 1. Initial push or Periodic Heartbeat (every 5 min)
    if (lastSalinity < 0 || (millis() - lastHeartbeat > HEARTBEAT_INTERVAL)) {
      isAnomaly  = true;
      triggerType = "HEARTBEAT";
      lastHeartbeat = millis();
    }
    // 2. Anomaly Detection - only push on significant change
    else if (abs(salinity - lastSalinity) > SAL_THRESHOLD) {
      isAnomaly  = true;
      triggerType = "SALINITY_SPIKE";
    } else if (abs(soilMoisture - lastMoisture) > MOIS_THRESHOLD) {
      isAnomaly  = true;
      triggerType = "MOISTURE_DROP";
    }

    if (isAnomaly) {
      Serial.printf("[Ingest] Triggering push (%s)...\n", triggerType.c_str());
      sendToBackend(salinity, soilMoisture, triggerType);
      lastSalinity = salinity;
      lastMoisture = soilMoisture;
    }

    // Fetch actuator state every 30 seconds to reduce network load
    if (millis() - lastFetchActuator > FETCH_ACTUATOR_INTERVAL) {
      lastFetchActuator = millis();
      fetchActuatorState();
    }

    // Actuator Control
    // Đã sửa "CLOSE" thành "CLOSED"
    if (currentAction == "CLOSED") {
      digitalWrite(VALVE_LED_PIN, HIGH);
    } else {
      digitalWrite(VALVE_LED_PIN, LOW);
    }

    // Update LCD
    char lcdBuf[21];
    snprintf(lcdBuf, sizeof(lcdBuf), "Sal:%.1fg M:%.0f%%", salinity, soilMoisture);
    lcd.setCursor(0, 0); lcd.print(lcdBuf);

    snprintf(lcdBuf, sizeof(lcdBuf), "Valve:%-6s[%-4s]", currentAction.c_str(), triggerType == "" ? "IDLE" : "PUSH");
    lcd.setCursor(0, 1); lcd.print(lcdBuf);

    lcd.setCursor(0, 2);
    lcd.print(WiFi.status() == WL_CONNECTED ? "Status: Cloud Sync  " : "Status: Offline     ");

    lcd.setCursor(0, 3);
    lcd.print(triggerType == "" ? "Mode: IDLE          " : "Mode: " + triggerType + "   ");
  }
}