#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <LiquidCrystal_I2C.h>
#include "DHTesp.h"

#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

// RTDB URL (Must include https://)
String rtdbURL = "https://salin-ai-hackathon-default-rtdb.asia-southeast1.firebasedatabase.app/SalinAI";

LiquidCrystal_I2C lcd(0x27, 20, 4);
DHTesp dht;
WiFiClientSecure client; 

#define DHT_PIN 15            
#define SALINITY_PIN 34       
#define SOIL_MOISTURE_PIN 35  
#define WATER_FLOW_PIN 32
#define VALVE_LED_PIN 2       

unsigned long lastTime = 0;
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

  // Bypass SSL verification to prevent HTTP -1 error
  client.setInsecure(); 
  
  lcd.clear();
  lcd.print("Ready to Sync!");
  delay(1000);
}

void loop() {
  // 3-second interval to prevent Wokwi disconnection
  if (millis() - lastTime > 3000) {
    lastTime = millis();

    // --- ĐỌC CẢM BIẾN ---
    float temp = dht.getTempAndHumidity().temperature;
    float humid = dht.getTempAndHumidity().humidity;
    float salinity = (analogRead(SALINITY_PIN) / 4095.0) * 5.0; 
    float soilMoisture = (analogRead(SOIL_MOISTURE_PIN) / 4095.0) * 100.0;
    float waterFlow = (analogRead(WATER_FLOW_PIN) / 4095.0) * 50.0; 

    // ==========================================
    // 1. Push Telemetry (PATCH)
    // ==========================================
    HTTPClient http;
    String sensorsJSON = "{\"salinity\":" + String(salinity) + ",\"soil_moisture\":" + String(soilMoisture) + ",\"water_flow\":" + String(waterFlow) + "}";
    
    client.setInsecure();
    http.begin(client, rtdbURL + "/sensors.json");  
    http.addHeader("Content-Type", "application/json");
    
    int patchCode = http.PATCH(sensorsJSON);
    if(patchCode > 0) {
       Serial.printf("Sent HTTP: %d | Sal: %.1f, Soil: %.0f, Flow: %.1f\n", patchCode, salinity, soilMoisture, waterFlow);
    } else {
       Serial.printf("Send Error HTTP: %d\n", patchCode);
    }
    http.end();

    // ==========================================
    // 2. Fetch AI Action (GET)
    // ==========================================
    client.setInsecure();
    http.begin(client, rtdbURL + "/control/action.json");
    int getCode = http.GET();
    if(getCode > 0) {
      String payload = http.getString();
      payload.replace("\"", ""); 
      if(payload == "CLOSE" || payload == "OPEN") {
        currentAction = payload;
      }
    }
    http.end();
    
    // ==========================================
    // 3. Actuator Control
    // ==========================================
    if (currentAction == "CLOSE") {
      digitalWrite(VALVE_LED_PIN, HIGH); 
    } else {
      digitalWrite(VALVE_LED_PIN, LOW);  
    }

    // ==========================================
    // 4. Update UI (LCD)
    // ==========================================
    char lcdBuf[21];
    
    snprintf(lcdBuf, sizeof(lcdBuf), "Sal:%.1fg Flw:%.1f", salinity, waterFlow);
    lcd.setCursor(0, 0); lcd.print(lcdBuf);

    snprintf(lcdBuf, sizeof(lcdBuf), "Soil:%.0f%% V:%-5s", soilMoisture, currentAction.c_str());
    lcd.setCursor(0, 1); lcd.print(lcdBuf);
    
    lcd.setCursor(0, 2); lcd.print("Status: Cloud Sync ");
  }
}