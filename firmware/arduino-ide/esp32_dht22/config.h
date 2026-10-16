#ifndef CONFIG_H
#define CONFIG_H

// ==============================================================================
// Arduino IDE - Days 3–4: ESP32 + DHT22 Firmware Configuration
// ==============================================================================

// ------------------------------------------------------------------------------
// 1. WiFi Settings
// ------------------------------------------------------------------------------
#define WIFI_SSID             "YOUR_WIFI_SSID"
#define WIFI_PASSWORD         "YOUR_WIFI_PASSWORD"

// ------------------------------------------------------------------------------
// 2. MQTT Broker Settings
// ------------------------------------------------------------------------------
// Host running Mosquitto (use your local LAN IP e.g. 192.168.1.15; do NOT use localhost on ESP32)
#define MQTT_BROKER           "192.168.1.100"
#define MQTT_PORT             1883

// Credentials (leave empty if mosquitto.conf permits anonymous access)
#define MQTT_USER             ""
#define MQTT_PASSWORD         ""

// ------------------------------------------------------------------------------
// 3. Device Identification
// Note: When setting up 2 boards:
//       Board 1 -> "esp32-dht22-01"
//       Board 2 -> "esp32-dht22-02"
// ------------------------------------------------------------------------------
#define DEVICE_ID             "esp32-dht22-01"
#define TENANT_ID             "a0000000-0000-0000-0000-000000000001"

// Topic structure: <MQTT_TOPIC_PREFIX>/<DEVICE_ID>/telemetry
// Example: devices/esp32-dht22-01/telemetry
#define MQTT_TOPIC_PREFIX     "devices"

// ------------------------------------------------------------------------------
// 4. Hardware Pinout
// ------------------------------------------------------------------------------
#define DHT_PIN               4     // ESP32 GPIO connected to DHT22 DATA (Recommended: GPIO 4 or GPIO 22)
#define DHT_TYPE              DHT22 // DHT22 / AM2302
#define STATUS_LED_PIN        2     // Built-in status LED on ESP32 DevKit (GPIO 2)

// ------------------------------------------------------------------------------
// 5. Intervals & Reconnect Backoff Configuration
// ------------------------------------------------------------------------------
#define PUBLISH_INTERVAL_MS   5000  // 5 seconds publish interval (Days 3-4 requirement)
#define INITIAL_BACKOFF_MS    1000  // Initial reconnect backoff: 1,000 ms (1s)
#define MAX_BACKOFF_MS        60000 // Maximum reconnect backoff cap: 60,000 ms (60s)

#endif // CONFIG_H
