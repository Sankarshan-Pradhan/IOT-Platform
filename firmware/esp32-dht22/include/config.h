// ==============================================================================
// ESP32 Provisioning Config for IoT Platform
// Generated automatically from IoT Platform Dashboard
// ==============================================================================
#ifndef CONFIG_H
#define CONFIG_H

// WiFi Credentials (Replace with your local Wi-Fi network before flashing)
#define WIFI_SSID             "YOUR_WIFI_SSID"
#define WIFI_PASSWORD         "YOUR_WIFI_PASSWORD"

// MQTT Broker
#define MQTT_BROKER           "192.168.0.112"
#define MQTT_PORT             1883

// Authentication & Identity
#define TENANT_ID             "4f39edef-66e5-47f9-afed-34d017a2bb5e"
#define CHANNEL_ID            "chan-dht22-nse2w0"
#define DEVICE_ID             "esp32-dht22-01"
#define MQTT_USER             "esp32-dht22-01"
#define MQTT_PASSWORD         "iot_sec_85daa459f8e18541f5a82b6d0155e400a625bc27"

// MQTT Topics
#define MQTT_TOPIC_PREFIX     "devices"
#define MQTT_TELEMETRY_TOPIC  "devices/esp32-dht22-01/telemetry"

// Hardware Pinout
#define DHT_PIN               4     // ESP32 GPIO connected to DHT22 DATA
#define DHT_TYPE              DHT22
#define STATUS_LED_PIN        2

// Polling & Reconnect Settings
#define PUBLISH_INTERVAL_MS   5000  // 5 seconds
#define INITIAL_BACKOFF_MS    1000  // 1 second
#define MAX_BACKOFF_MS        60000 // 60 seconds

#endif // CONFIG_H