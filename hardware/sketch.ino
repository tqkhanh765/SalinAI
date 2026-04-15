#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <LiquidCrystal_I2C.h>
#include "DHTesp.h"

#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

// ─── Backend URL (Deployed on Render) ────────────────────────────────────────
// Wokwi sends data to the backend, which enriches it with Weather/Tide APIs,
// stores to Firebase, triggers AI Agent, and streams to Frontend.
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

void setup() {
  Serial.begin(115200);

  lcd.init();
  lcd.backlight();
  pinMode(VALVE_LED_PIN, OUTPUT);
  dht.setup(DHT_PIN, DHTesp::DHT22);

  lcd.setCursor(0, 0);
  lcd.print("Connecting Wi-Fi...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");

  // Bypass SSL cert verification (required for Wokwi HTTPS)
  client.setInsecure();

  lcd.clear();
  lcd.print("SalinAI Online!");
  delay(1000);
}

// ─── POST sensor data to Backend /api/ingest ─────────────────────────────────
// Backend will: enrich with Weather API, save to Firebase, trigger AI if needed
void sendToBackend(float sal, float mois, String triggerType) {
  client.setInsecure();
  HTTPClient http;
  http.begin(client, backendURL);
  http.addHeader("Content-Type", "application/json");

  // Flat JSON - matches backend /api/ingest schema
  String json = "{";
  json += "\"salinity\":" + String(sal, 2) + ",";
  json += "\"moisture\":" + String(mois, 1) + ",";
  json += "\"crop_stage\":\"VEGETATIVE\"";
  json += "}";

  Serial.println("[HTTP] POST -> " + json);
  int code = http.POST(json);

  if (code > 0) {
    Serial.printf("[HTTP] Backend OK: %d\n", code);
    String response = http.getString();
    Serial.println("[HTTP] Response: " + response.substring(0, 100));
  } else {
    Serial.printf("[HTTP] Backend Error: %s\n", http.errorToString(code).c_str());
  }
  http.end();
}

// ─── Read actuator valve state from Firebase /actuator ───────────────────────
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

    // Always fetch latest actuator command from Firebase
    fetchActuatorState();

    // Actuator Control
    if (currentAction == "CLOSE") {
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
    lcd.print("Status: Cloud Sync  ");

    lcd.setCursor(0, 3);
    lcd.print(triggerType == "" ? "Mode: IDLE          " : "Mode: " + triggerType + "   ");
  }
}
