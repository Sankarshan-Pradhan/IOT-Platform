/**
 * ==============================================================================
 * IoT Platform - Days 3–4: ESP32 + DHT22 Firmware (Arduino IDE Sketch)
 * ==============================================================================
 * Requirements:
 *  - Boards Manager: esp32 by Espressif Systems
 *  - Libraries (Install via Arduino Library Manager):
 *      1. "DHT sensor library" by Adafruit
 *      2. "Adafruit Unified Sensor" by Adafruit
 *      3. "PubSubClient" by Nick O'Leary
 *      4. "ArduinoJson" by Benoit Blanchon (v6 or v7)
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include "config.h"

// ------------------------------------------------------------------------------
// Global Instances & Objects
// ------------------------------------------------------------------------------
WiFiClient espClient;
PubSubClient mqttClient(espClient);
DHT dht(DHT_PIN, DHT_TYPE);

// ------------------------------------------------------------------------------
// Timing & Backoff State Variables
// ------------------------------------------------------------------------------
static unsigned long lastPublishMillis   = 0;
static unsigned long lastWifiRetryMillis = 0;
static unsigned long wifiBackoffMs       = INITIAL_BACKOFF_MS;
static unsigned long lastMqttRetryMillis = 0;
static unsigned long mqttBackoffMs       = INITIAL_BACKOFF_MS;
static uint32_t      messageSequence     = 0;

// Topic buffers
static char telemetryTopic[128];
static char statusTopic[128];

// ------------------------------------------------------------------------------
// Function Declarations
// ------------------------------------------------------------------------------
void setupWiFi();
void maintainWiFiConnection();
void maintainMQTTConnection();
void publishTelemetry();
void blinkLED(uint8_t count, unsigned int durationMs);

// ------------------------------------------------------------------------------
// Setup
// ------------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    delay(500);

    pinMode(STATUS_LED_PIN, OUTPUT);
    digitalWrite(STATUS_LED_PIN, LOW);

    // Format topic strings
    snprintf(telemetryTopic, sizeof(telemetryTopic), "%s/%s/telemetry", MQTT_TOPIC_PREFIX, DEVICE_ID);
    snprintf(statusTopic, sizeof(statusTopic), "%s/%s/status", MQTT_TOPIC_PREFIX, DEVICE_ID);

    Serial.println();
    Serial.println("==================================================");
    Serial.println("   IoT Platform: ESP32 + DHT22 Firmware Node");
    Serial.println("==================================================");
    Serial.printf("Device ID:      %s\n", DEVICE_ID);
    Serial.printf("Tenant ID:      %s\n", TENANT_ID);
    Serial.printf("DHT Pin:        GPIO %d (Type: DHT22)\n", DHT_PIN);
    Serial.printf("Telemetry Topic:%s\n", telemetryTopic);
    Serial.printf("Publish Rate:   Every %d ms\n", PUBLISH_INTERVAL_MS);
    Serial.println("==================================================");

    // Initialize DHT sensor
    dht.begin();
    Serial.println("[DHT22] Sensor initialized.");

    // Configure MQTT client
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setBufferSize(512);

    // Initial WiFi connection attempt
    setupWiFi();
}

// ------------------------------------------------------------------------------
// Main Loop (Non-blocking)
// ------------------------------------------------------------------------------
void loop() {
    // 1. Maintain WiFi with backoff
    maintainWiFiConnection();

    // If WiFi is disconnected, skip MQTT handling until WiFi returns
    if (WiFi.status() != WL_CONNECTED) {
        return;
    }

    // 2. Maintain MQTT with backoff
    maintainMQTTConnection();

    // If MQTT is disconnected, do not attempt to publish
    if (!mqttClient.connected()) {
        return;
    }

    // 3. Process MQTT incoming packets / keep-alive pings
    mqttClient.loop();

    // 4. Publish telemetry on configured interval (every 5 seconds)
    unsigned long currentMillis = millis();
    if (currentMillis - lastPublishMillis >= PUBLISH_INTERVAL_MS) {
        lastPublishMillis = currentMillis;
        publishTelemetry();
    }
}

// ------------------------------------------------------------------------------
// WiFi Initialization
// ------------------------------------------------------------------------------
void setupWiFi() {
    Serial.printf("[WiFi] Initiating connection to SSID: '%s'...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    lastWifiRetryMillis = millis();
}

// ------------------------------------------------------------------------------
// WiFi Connection Maintenance with Exponential Backoff
// ------------------------------------------------------------------------------
void maintainWiFiConnection() {
    if (WiFi.status() == WL_CONNECTED) {
        if (wifiBackoffMs != INITIAL_BACKOFF_MS) {
            Serial.printf("[WiFi] Connected! IP Address: %s (RSSI: %d dBm)\n",
                          WiFi.localIP().toString().c_str(), WiFi.RSSI());
            wifiBackoffMs = INITIAL_BACKOFF_MS;
        }
        return;
    }

    // WiFi is disconnected: check if backoff duration has elapsed
    unsigned long currentMillis = millis();
    if (currentMillis - lastWifiRetryMillis >= wifiBackoffMs) {
        lastWifiRetryMillis = currentMillis;

        Serial.printf("[WiFi] Connection lost or not established. Reconnecting (backoff: %lu ms)...\n",
                      wifiBackoffMs);

        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

        // Exponential backoff capped at MAX_BACKOFF_MS
        wifiBackoffMs = min(wifiBackoffMs * 2, (unsigned long)MAX_BACKOFF_MS);
        Serial.printf("[WiFi] Next retry in %lu ms if still disconnected.\n", wifiBackoffMs);
    }
}

// ------------------------------------------------------------------------------
// MQTT Broker Maintenance with Exponential Backoff
// ------------------------------------------------------------------------------
void maintainMQTTConnection() {
    if (mqttClient.connected()) {
        return;
    }

    unsigned long currentMillis = millis();
    if (currentMillis - lastMqttRetryMillis >= mqttBackoffMs) {
        lastMqttRetryMillis = currentMillis;

        Serial.printf("[MQTT] Connecting to broker %s:%d as '%s' (backoff: %lu ms)...\n",
                      MQTT_BROKER, MQTT_PORT, DEVICE_ID, mqttBackoffMs);

        // Connect with Last Will and Testament (LWT)
        bool connected = false;
        if (strlen(MQTT_USER) > 0) {
            connected = mqttClient.connect(DEVICE_ID, MQTT_USER, MQTT_PASSWORD,
                                           statusTopic, 1, true, "offline");
        } else {
            connected = mqttClient.connect(DEVICE_ID, nullptr, nullptr,
                                           statusTopic, 1, true, "offline");
        }

        if (connected) {
            Serial.println("[MQTT] Connected to Mosquitto broker successfully!");
            mqttBackoffMs = INITIAL_BACKOFF_MS;

            // Publish device online status
            mqttClient.publish(statusTopic, "online", true);

            // Visual feedback: 2 fast blinks
            blinkLED(2, 60);
        } else {
            Serial.printf("[MQTT] Connection failed (error code rc=%d). Retrying in %lu ms...\n",
                          mqttClient.state(), mqttBackoffMs);

            // Double backoff duration capped at MAX_BACKOFF_MS
            mqttBackoffMs = min(mqttBackoffMs * 2, (unsigned long)MAX_BACKOFF_MS);
        }
    }
}

// ------------------------------------------------------------------------------
// Sensor Read & Telemetry Publish
// ------------------------------------------------------------------------------
void publishTelemetry() {
    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature(); // Celsius

    if (isnan(humidity) || isnan(temperature)) {
        Serial.println("[DHT22] Warning: Failed to read from sensor! Check wiring and 4.7k-10k pull-up resistor.");
        return;
    }

    // Round values to 1 decimal place
    temperature = roundf(temperature * 10.0f) / 10.0f;
    humidity = roundf(humidity * 10.0f) / 10.0f;

    // Build JSON telemetry document
    JsonDocument doc;
    doc["device_id"]     = DEVICE_ID;
    doc["tenant_id"]     = TENANT_ID;
    doc["temperature_c"] = temperature;
    doc["humidity_pct"]  = humidity;
    doc["seq"]           = ++messageSequence;
    doc["uptime_s"]      = millis() / 1000;
    doc["wifi_rssi"]     = WiFi.RSSI();

    char payloadBuffer[256];
    serializeJson(doc, payloadBuffer);

    // Publish via MQTT if broker connected; otherwise fallback to direct HTTP POST to Go backend (:8080)
    bool success = false;
    if (mqttClient.connected()) {
        success = mqttClient.publish(telemetryTopic, payloadBuffer);
        if (success) {
            Serial.printf("[MQTT] [%lu s] Temp: %.1f C | Humidity: %.1f %% | RSSI: %d dBm | Topic: %s\n",
                          millis() / 1000, temperature, humidity, WiFi.RSSI(), telemetryTopic);
        }
    } else if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        String backendUrl = String("http://") + MQTT_BROKER + ":8080/api/v1/devices/" + DEVICE_ID + "/telemetry";
        http.begin(backendUrl);
        http.addHeader("Content-Type", "application/json");
        int httpCode = http.POST(payloadBuffer);
        if (httpCode >= 200 && httpCode < 300) {
            success = true;
            Serial.printf("[HTTP] [%lu s] Telemetry posted to backend: %d OK | Temp: %.1f C | Hum: %.1f %%\n",
                          millis() / 1000, httpCode, temperature, humidity);
        } else {
            Serial.printf("[HTTP] Notice: Could not post to %s (code: %d)\n", backendUrl.c_str(), httpCode);
        }
        http.end();
    }

    if (success) {
        // Brief status LED pulse on successful transmission
        digitalWrite(STATUS_LED_PIN, HIGH);
        delay(35);
        digitalWrite(STATUS_LED_PIN, LOW);
    } else {
        Serial.printf("[PUB] Waiting for broker or backend connection...\n");
    }
}

// ------------------------------------------------------------------------------
// Helper: Blink Status LED
// ------------------------------------------------------------------------------
void blinkLED(uint8_t count, unsigned int durationMs) {
    for (uint8_t i = 0; i < count; i++) {
        digitalWrite(STATUS_LED_PIN, HIGH);
        delay(durationMs);
        digitalWrite(STATUS_LED_PIN, LOW);
        if (i < count - 1) {
            delay(durationMs);
        }
    }
}
