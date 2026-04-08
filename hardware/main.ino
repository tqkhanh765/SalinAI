#include <WiFi.h>
#include <Firebase_ESP_Client.h>

#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

#define WIFI_SSID "TEN_WIFI_CUA_BAN"
#define WIFI_PASSWORD "MAT_KHAU_WIFI"

#define FIREBASE_API_KEY "API_KEY_CUA_PROJECT_FIREBASE"
#define FIREBASE_DATABASE_URL "LINK_REALTIME_DB.firebaseio.com"

#define SENSOR_PIN 34
#define RELAY_PIN 2