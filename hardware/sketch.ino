#include <WiFi.h>
#include <HTTPClient.h>
#include <LiquidCrystal_I2C.h>
#include "DHTesp.h"

// --- CONFIGURATION ---
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

// Unified Backend Ingestion Endpoint
String backendURL = "http://your-backend-api.com/api/ingest"; 
// Firebase mirror for direct actuator reading (remains for low-latency sync)
String rtdbURL = "https://salin-ai-hackathon-default-rtdb.asia-southeast1.firebasedatabase.app/SalinAI";

LiquidCrystal_I2C lcd(0x27, 20, 4);
DHTesp dht;
WiFiClient wifiClient; 

#define DHT_PIN 15            
#define SALINITY_PIN 34       
#define SOIL_MOISTURE_PIN 35  
#define WATER_FLOW_PIN 32
#define VALVE_LED_PIN 2       

// Timing & Thresholds
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 300000; // 5 minutes in ms
const float SAL_THRESHOLD = 0.5;
const float MOIS_THRESHOLD = 10.0;

// State Tracking for Anomaly Detection
float lastSalinity = -1.0;
float lastMoisture = -1.0;
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
  
  lcd.clear();
  lcd.print("SalinAI Online!");
  delay(1000);
}

void sendData(float sal, float mois, float flow) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(wifiClient, backendURL);
    http.addHeader("Content-Type", "application/json");

    // Construct JSON Payload
    String json = "{\"sensor_telemetry\":{";
    json += "\"river_salinity\":" + String(sal) + ",";
    json += "\"soil_moisture\":" + String(mois) + ",";
    json += "\"water_flow\":" + String(flow);
    json += "}}";

    int httpResponseCode = http.POST(json);
    
    if (httpResponseCode > 0) {
      Serial.printf("[HTTP] POST Success: %d\n", httpResponseCode);
    } else {
      Serial.printf("[HTTP] POST Error: %s\n", http.errorToString(httpResponseCode).c_str());
    }
    http.end();
  }
}

void loop() {
  // Read Sensors every 5 seconds for internal monitoring and anomaly check
  static unsigned long lastRead = 0;
  if (millis() - lastRead > 5000) {
    lastRead = millis();

    float salinity = (analogRead(SALINITY_PIN) / 4095.0) * 5.0; 
    float soilMoisture = (analogRead(SOIL_MOISTURE_PIN) / 4095.0) * 100.0;
    float waterFlow = (analogRead(WATER_FLOW_PIN) / 4095.0) * 50.0; 

    bool isAnomaly = false;
    String triggerType = "";

    // 1. Initial push or Heartbeat (5 min)
    if (lastSalinity < 0 || (millis() - lastHeartbeat > HEARTBEAT_INTERVAL)) {
      isAnomaly = true;
      triggerType = "HEARTBEAT";
      lastHeartbeat = millis();
    } 
    // 2. Anomaly Detection (Massive Delta)
    else if (abs(salinity - lastSalinity) > SAL_THRESHOLD) {
      isAnomaly = true;
      triggerType = "SALINITY_SPIKE";
    } else if (abs(soilMoisture - lastMoisture) > MOIS_THRESHOLD) {
      isAnomaly = true;
      triggerType = "MOISTURE_DROP";
    }

    if (isAnomaly) {
      Serial.printf("[Ingest] Triggering push (%s)...\n", triggerType.c_str());
      sendData(salinity, soilMoisture, waterFlow);
      lastSalinity = salinity;
      lastMoisture = soilMoisture;
    }

    // 3. Update Actuator State (Fetch from Firebase for real-time responsiveness)
    HTTPClient http;
    http.begin(wifiClient, rtdbURL + "/control/action.json");
    int getCode = http.GET();
    if (getCode > 0) {
      String payload = http.getString();
      payload.replace("\"", ""); 
      if (payload == "CLOSE" || payload == "OPEN") {
        currentAction = payload;
      }
    }
    http.end();

    if (currentAction == "CLOSE") {
      digitalWrite(VALVE_LED_PIN, HIGH); 
    } else {
      digitalWrite(VALVE_LED_PIN, LOW);  
    }

    // 4. Update LCD
    char lcdBuf[21];
    snprintf(lcdBuf, sizeof(lcdBuf), "S:%.1f M:%.0f F:%.1f", salinity, soilMoisture, waterFlow);
    lcd.setCursor(0, 0); lcd.print(lcdBuf);
    snprintf(lcdBuf, sizeof(lcdBuf), "Valve:%-5s [%s]", currentAction.c_str(), triggerType == "" ? "IDLE" : "PUSH");
    lcd.setCursor(0, 1); lcd.print(lcdBuf);
  }
}