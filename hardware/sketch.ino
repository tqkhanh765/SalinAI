    # include <WiFi.h>
    # include <HTTPClient.h>
    # include <WiFiClientSecure.h>
    # include <LiquidCrystal_I2C.h>
    # include "DHTesp.h"

    # define WIFI_SSID "Wokwi-GUEST"
    # define WIFI_PASSWORD ""

    // ─── Firebase RTDB ────────────────────────────────────────────────────────────
    String rtdbURL        = "https://salin-ai-hackathon-default-rtdb.asia-southeast1.firebasedatabase.app";
    String SENSOR_PATH    = "/SalinAI/sensor_data.json";
    String ACTUATOR_PATH  = "/SalinAI/actuator/valve_state.json";


    // ─── Hardware ─────────────────────────────────────────────────────────────────
    LiquidCrystal_I2C lcd(0x27, 20, 4);
    DHTesp dht;
    WiFiClientSecure client;
    # define VALVE_LED_PIN 2

    // ─── Ngưỡng phát hiện biến động ──────────────────────────────────────────────
    const unsigned long HEARTBEAT_INTERVAL = 300000; // 5 phút
    const float SAL_THRESHOLD  = 0.1; // Nhạy hơn (0.1ppt) để demo mượt
    const float MOIS_THRESHOLD = 1.0; // Nhạy hơn (1%) để demo mượt


    // ─── State ────────────────────────────────────────────────────────────────────
    float lastSalinity   = -1.0;
    float lastMoisture   = -1.0;
    String currentAction = "OPEN";
    unsigned long lastHeartbeat = 0;
    bool isFirstSync = true; // Để đồng bộ trạng thái ban đầu mà không in Log

    // ─── Eager Poll ───────────────────────────────────────────────────────────────
    const unsigned long NORMAL_POLL_INTERVAL = 30000; // 30s khi rảnh
    const unsigned long EAGER_POLL_INTERVAL  =  5000; // 5s sau khi gửi data
    const unsigned long EAGER_DURATION_MS   =  60000; // tối đa 1 phút

    unsigned long lastActuatorPoll = 0;
    unsigned long eagerPollUntil   = 0;

    // ─── KỊCH BẢN DEMO 5 PHÚT (20 steps × 40 giây) ───────────────────────────────
    const int TOTAL_STEPS = 20;
    int currentStep = 0;

    const float mock_salinity[TOTAL_STEPS] = {
      0.4, 0.6, 0.9, 1.5,   // Tăng dần (Trigger nhẹ)
      2.8, 3.5, 4.2, 5.0,   // Mặn xâm nhập mạnh (Trigger liên tục)
      4.8, 4.2, 3.5, 2.1,   // Giảm dần do có mưa ngọt
      1.2, 0.6, 0.4, 0.3,   // Về mức an toàn
      0.3, 0.4, 0.3, 0.3    // Ổn định
  };
  const float mock_moisture[TOTAL_STEPS] = {
      65.0, 64.0, 62.0, 58.0, // Đang khô dần
      52.0, 48.0, 42.0, 38.0, // Rất khô (Hạn mặn)
      45.0, 55.0, 65.0, 75.0, // Có mưa (Moisture tăng vọt)
      72.0, 70.0, 68.0, 67.0, // Ổn định lại
      66.0, 65.5, 65.0, 65.0
  };
  const float mock_flow[TOTAL_STEPS] = {
      25.0, 25.0, 25.0, 25.0, // Đang tưới
      0.0,  0.0,  0.0,  0.0,  // Đóng van khẩn cấp do mặn
      0.0,  0.0,  15.0, 20.0, // Bắt đầu mở nhẹ khi mặn giảm
      25.0, 25.0, 25.0, 25.0, // Mở hoàn toàn
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
      while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
      Serial.println("\n[WiFi] Connected");

      client.setInsecure();
      lcd.clear();
      lcd.print("SalinAI Online!");

      // Đồng bộ trạng thái van lần đầu từ Firebase
      Serial.print("[Sync] Dang lay trang thai van...");
      fetchActuatorState();
      Serial.println(" Xong.");

      delay(1000);
    }

    // ─── Ghi sensor lên Firebase (PUT) ───────────────────────────────────────────
    void writeToFirebase(float sal, float mois, float flow, String triggerType) {
      client.setInsecure();
      HTTPClient http;
      http.begin(client, rtdbURL + SENSOR_PATH);
      http.addHeader("Content-Type", "application/json");

      // Đã sửa lại lỗi mặt mếu và chuỗi escape JSON
      String json = "{";
      json += "\"salinity\":"   + String(sal,  2) + ",";
      json += "\"moisture\":"   + String(mois, 1) + ",";
      json += "\"water_flow\":" + String(flow, 1) + ",";
      json += "\"crop_stage\":\"VEGETATIVE\",";
      json += "\"trigger\":\""  + triggerType + "\",";
      json += "\"timestamp\":"  + String(millis());
      json += "}";

      int code = http.PUT(json);
      Serial.printf("  -> Firebase: %s\n", code > 0 ? "OK" : "FAIL");
      http.end();
    }

    // ─── Đọc valve_state từ Firebase ─────────────────────────────────────────────
    void fetchActuatorState() {
      client.setInsecure();
      HTTPClient http;
      http.begin(client, rtdbURL + ACTUATOR_PATH);
      int code = http.GET();
      if (code == 200) {
        String payload = http.getString();
        payload.replace("\"", "");
        payload.trim();
        if (payload == "CLOSED" || payload == "OPEN") {
          if (isFirstSync) {
            currentAction = payload;
            isFirstSync = false;
            Serial.printf("  ✓ Van sync khởi động: %s\n", currentAction.c_str());
          } else if (payload != currentAction) {
            currentAction  = payload;
            Serial.printf("  -> Van: %s (AI quyet dinh)\n", currentAction.c_str());
            eagerPollUntil = 0;
          } else {
            Serial.printf("  • Van không đổi: %s\n", currentAction.c_str());
          }
        } else if (payload == "" || payload == "null") {
          Serial.printf("  ⚠ Firebase chưa có van tại %s\n", ACTUATOR_PATH);
        } else {
          Serial.printf("  ⚠ Payload van không hợp lệ: %s\n", payload.c_str());
        }
      } else if (code == -1) {
        Serial.printf("  ✗ Firebase timeout khi đọc van (%s)\n", ACTUATOR_PATH);
      } else {
        Serial.printf("  ✗ Firebase HTTP %d khi đọc van (%s)\n", code, ACTUATOR_PATH);
      }
      http.end();
    }



    // ─── Poll van: nhanh sau trigger, chậm khi rảnh ──────────────────────────────
    void runActuatorPoll() {
      bool isEager = (millis() < eagerPollUntil);
      unsigned long interval = isEager ? EAGER_POLL_INTERVAL : NORMAL_POLL_INTERVAL;

      if (millis() - lastActuatorPoll >= interval) {
        lastActuatorPoll = millis();
        fetchActuatorState(); // eager hay normal đều chỉ cần check van
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────

    void loop() {
      static unsigned long lastRead = 0;

      // ─── KIỂM TRA VAN LIÊN TỤC (Chạy song song, không bị kẹt 45s) ───
      runActuatorPoll();
      digitalWrite(VALVE_LED_PIN, currentAction == "CLOSED" ? HIGH : LOW);

      // ─── THỰC THI STEP SENSOR MỖI 45 GIÂY ─────────────────────────────
      if (millis() - lastRead > (lastRead == 0 ? 0 : 45000)) {
        lastRead = millis();

        float sal  = mock_salinity[currentStep];
        float mois = mock_moisture[currentStep];
        float flow = mock_flow[currentStep];

        // ── Xác định trigger ───────────────────────────────────────────────────
        bool   send        = false;
        String triggerType = "";

        if (lastSalinity < 0 || (millis() - lastHeartbeat > HEARTBEAT_INTERVAL)) {
          send = true; triggerType = "HEARTBEAT"; lastHeartbeat = millis();
        } else if (abs(sal  - lastSalinity) >= SAL_THRESHOLD)  {
          send = true; triggerType = "SAL_SPIKE";
        } else if (abs(mois - lastMoisture) >= MOIS_THRESHOLD) {
          send = true; triggerType = "MOIS_DROP";
        }

        // ── Log 1 dòng duy nhất mỗi step ──────────────────────────────────────
        if (send) {
          Serial.printf("\n[Step %02d] Sal:%.1f Mois:%.0f%% | %s -> Gui Firebase\n",
                        currentStep, sal, mois, triggerType.c_str());
          writeToFirebase(sal, mois, flow, triggerType);
          lastSalinity   = sal;
          lastMoisture   = mois;
          eagerPollUntil = millis() + EAGER_DURATION_MS;
          lastActuatorPoll = 0; // poll ngay sau khi gửi data
        } else {
          Serial.printf("[Step %02d] Sal:%.1f Mois:%.0f%% | IDLE\n",
                        currentStep, sal, mois);
        }

        currentStep++;
        if (currentStep >= TOTAL_STEPS) {
          Serial.println("\n===== DEMO XONG - CHAY LAI =====");
          currentStep  = 0;
          lastSalinity = -1.0;
        }

        runActuatorPoll();

        digitalWrite(VALVE_LED_PIN, currentAction == "CLOSED" ? HIGH : LOW);

        // ── LCD ────────────────────────────────────────────────────────────────
        char buf[21];
        snprintf(buf, sizeof(buf), "Sal:%.1fppt Flw:%.0f ", sal, flow);
        lcd.setCursor(0, 0); lcd.print(buf);
        snprintf(buf, sizeof(buf), "Mois:%.0f%% V:%-6s", mois, currentAction.c_str());
        lcd.setCursor(0, 1); lcd.print(buf);
        lcd.setCursor(0, 2); lcd.print("Status: Firebase    ");
        snprintf(buf, sizeof(buf), "Evt:%-16s", triggerType == "" ? "IDLE" : triggerType.c_str());
        lcd.setCursor(0, 3); lcd.print(buf);
      }
    }