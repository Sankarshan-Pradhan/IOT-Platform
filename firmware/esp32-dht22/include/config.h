// ==============================================================================
// ESP32 Provisioning Config for IoT Platform
// Generated automatically from IoT Platform Dashboard
// ==============================================================================
#ifndef CONFIG_H
#define CONFIG_H

// WiFi Credentials (Replace with your local Wi-Fi network before flashing)
#define WIFI_SSID             "TeezashLabs_2G"
#define WIFI_PASSWORD         "Teezash@22"

// MQTT Broker
#define MQTT_BROKER           "192.168.0.112"
#define MQTT_PORT             1883

// Authentication & Identity
#define TENANT_ID             "c17c4bd8-e397-4b37-9acd-50501d60b282"
#define CHANNEL_ID            "chan-iot-lab-ev8904"
#define DEVICE_ID             "esp32-sensor-25"
#define MQTT_USER             ""
#define MQTT_PASSWORD         ""

// MQTT Topics
#define MQTT_TOPIC_PREFIX     "devices"
#define MQTT_TELEMETRY_TOPIC  "devices/esp32-dht22-01/telemetry"

// Hardware Pinout
#define DHT_PIN               4     // ESP32 GPIO connected to DHT22 DATA
#define DHT_TYPE              DHT22
#define STATUS_LED_PIN        2     // Built-in status LED on ESP32 DevKit (GPIO 2)
#define RELAY_PIN             26    // AC/DC Relay Module IN (Active HIGH)

// Polling & Reconnect Settings
#define PUBLISH_INTERVAL_MS   5000  // 5 seconds
#define INITIAL_BACKOFF_MS    1000  // 1 second
#define MAX_BACKOFF_MS        60000 // 60 seconds

#endif // CONFIG_H