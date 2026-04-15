#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <LiquidCrystal_I2C.h>
#include "DHTesp.h"

#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

// ─── Firebase RTDB Base URL ──────────────────────────────────────────────────
// ESP32 (Wokwi) writes directly to Firebase RTDB.
// The backend SSE stream reads from the same paths and forwards to the Frontend.
String rtdbBase = "https://salin-ai-hackathon-default-rtdb.asia-southeast1.firebasedatabase.app";

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

  // Bypass SSL cert verification (required for Wokwi + Firebase HTTPS)
  client.setInsecure();

  lcd.clear();
  lcd.print("SalinAI Online!");
  delay(1000);
}

// ─── Push sensor data to Firebase /sensor_data ───────────────────────────────
// This path is the same one the backend reads + streams to the Frontend SSE.
void pushSensorData(float sal, float mois, float flow, String triggerType) {
  client.setInsecure();
  HTTPClient http;

  // Flat JSON matching backend schema
  String json = "{";
  json += "\"salinity\":"        + String(sal,  2) + ",";
  json += "\"moisture\":"        + String(mois, 1) + ",";
  json += "\"water_flow\":"      + String(flow, 1) + ",";
  json += "\"crop_stage\":\"VEGETATIVE\",";
  json += "\"timestamp\":\"" + String(millis()) + "\"";
  json += "}";

  // PUT replaces the full sensor_data node with fresh values
  http.begin(client, rtdbBase + "/sensor_data.json");
  http.addHeader("Content-Type", "application/json");

  int code = http.PUT(json);
  if (code > 0) {
    Serial.printf("[Firebase] Push OK (%s): %d | Sal:%.1f Soil:%.0f\n",
                  triggerType.c_str(), code, sal, mois);
  } else {
    Serial.printf("[Firebase] Push Error: %s\n", http.errorToString(code).c_str());
  }
  http.end();
}

// ─── Read actuator valve state from Firebase /actuator ───────────────────────
void fetchActuatorState() {
  client.setInsecure();
  HTTPClient http;
  http.begin(client, rtdbBase + "/actuator/valve_state.json");
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
    float waterFlow    = (analogRead(WATER_FLOW_PIN)    / 4095.0) * 50.0;

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
      pushSensorData(salinity, soilMoisture, waterFlow, triggerType);
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
    snprintf(lcdBuf, sizeof(lcdBuf), "Sal:%.1fg Flw:%.1f", salinity, waterFlow);
    lcd.setCursor(0, 0); lcd.print(lcdBuf);

    snprintf(lcdBuf, sizeof(lcdBuf), "Soil:%.0f%% V:%-5s", soilMoisture, currentAction.c_str());
    lcd.setCursor(0, 1); lcd.print(lcdBuf);

    lcd.setCursor(0, 2);
    lcd.print("Status: Cloud Sync  ");

    lcd.setCursor(0, 3);
    lcd.print(triggerType == "" ? "Mode: IDLE          " : "Mode: " + triggerType + "   ");
  }
}
