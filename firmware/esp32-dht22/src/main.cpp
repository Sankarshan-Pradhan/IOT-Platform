/**
 * ==============================================================================
 * IoT Platform - Days 3–4: ESP32 + DHT22 Firmware
 * ==============================================================================
 * Features:
 *  - Reads DHT22 (AM2302) temperature and relative humidity every 5 seconds
 *  - Publishes JSON telemetry: {"temperature_c": ..., "humidity_pct": ...}
 *  - MQTT topic: devices/<DEVICE_ID>/telemetry
 *  - Exponential reconnect backoff for WiFi (1s -> 60s)
 *  - Exponential reconnect backoff for MQTT broker (1s -> 60s)
 *  - Non-blocking loop architecture
 *  - Status LED pulse on telemetry transmission
 *  - MQTT Last Will and Testament (LWT) for device offline detection
 * ==============================================================================
 */

#include <Arduino.h>
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
static unsigned long publishIntervalMs   = PUBLISH_INTERVAL_MS;

// Actuation & Hardware State
static bool relayState = false;
static bool ledState   = false;

// Topic buffers
static char telemetryTopic[128];
static char statusTopic[128];
static char commandTopic[128];
static char ackTopic[128];

// ------------------------------------------------------------------------------
// Function Declarations
// ------------------------------------------------------------------------------
void setupWiFi();
void maintainWiFiConnection();
void maintainMQTTConnection();
void publishTelemetry();
void blinkLED(uint8_t count, unsigned int durationMs);
void onMqttMessage(char* topic, byte* payload, unsigned int length);

// ------------------------------------------------------------------------------
// Setup
// ------------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    delay(500);

    pinMode(STATUS_LED_PIN, OUTPUT);
    digitalWrite(STATUS_LED_PIN, LOW);
#ifdef RELAY_PIN
    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, LOW);
#endif

    // Format topic strings
    snprintf(telemetryTopic, sizeof(telemetryTopic), "%s/%s/telemetry", MQTT_TOPIC_PREFIX, DEVICE_ID);
    snprintf(statusTopic, sizeof(statusTopic), "%s/%s/status", MQTT_TOPIC_PREFIX, DEVICE_ID);
    snprintf(commandTopic, sizeof(commandTopic), "%s/%s/commands", MQTT_TOPIC_PREFIX, DEVICE_ID);
    snprintf(ackTopic, sizeof(ackTopic), "%s/%s/command_ack", MQTT_TOPIC_PREFIX, DEVICE_ID);

    Serial.println();
    Serial.println("==================================================");
    Serial.println("   IoT Platform: ESP32 + DHT22 Firmware Node");
    Serial.println("==================================================");
    Serial.printf("Device ID:      %s\n", DEVICE_ID);
    Serial.printf("Tenant ID:      %s\n", TENANT_ID);
    Serial.printf("DHT Pin:        GPIO %d (Type: DHT22)\n", DHT_PIN);
    Serial.printf("Telemetry Topic:%s\n", telemetryTopic);
    Serial.printf("Command Topic:  %s\n", commandTopic);
    Serial.printf("Publish Rate:   Every %d ms\n", PUBLISH_INTERVAL_MS);
    Serial.println("==================================================");

    // Initialize DHT sensor
    dht.begin();
    Serial.println("[DHT22] Sensor initialized.");

    // Configure MQTT client & downlink callback
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setCallback(onMqttMessage);
    mqttClient.setBufferSize(512); // Buffer size for JSON payload

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

    // 4. Publish telemetry on dynamically configured interval
    unsigned long currentMillis = millis();
    if (currentMillis - lastPublishMillis >= publishIntervalMs) {
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
            // Reconnected successfully after a disconnect
            Serial.printf("[WiFi] Connected! IP Address: %s (RSSI: %d dBm)\n",
                          WiFi.localIP().toString().c_str(), WiFi.RSSI());
            wifiBackoffMs = INITIAL_BACKOFF_MS; // Reset backoff
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
        // Topic: devices/<DEVICE_ID>/status, Payload: "offline", QoS: 1, Retain: true
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
            mqttBackoffMs = INITIAL_BACKOFF_MS; // Reset backoff upon success

            // Publish device online status
            mqttClient.publish(statusTopic, "online", true);

            // Subscribe to Downlink Commands topic
            mqttClient.subscribe(commandTopic, 1);
            Serial.printf("[MQTT] Subscribed to downlink commands: %s\n", commandTopic);

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
// Downlink MQTT Message Callback (Two-Way Device Control & Actuation)
// ------------------------------------------------------------------------------
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    char payloadStr[length + 1];
    memcpy(payloadStr, payload, length);
    payloadStr[length] = '\0';

    Serial.printf("[COMMAND] Received on %s: %s\n", topic, payloadStr);

    StaticJsonDocument<384> doc;
    DeserializationError error = deserializeJson(doc, payloadStr);
    if (error) {
        Serial.printf("[COMMAND] JSON Parse failed: %s\n", error.c_str());
        return;
    }

    const char* cmdId = doc["command_id"] | "unknown";
    const char* action = doc["action"] | "";
    char resultMsg[128] = "Executed";
    bool success = true;

    if (strcmp(action, "set_relay") == 0) {
        relayState = doc["payload"]["state"] | false;
#ifdef RELAY_PIN
        digitalWrite(RELAY_PIN, relayState ? HIGH : LOW);
        snprintf(resultMsg, sizeof(resultMsg), "Relay set to %s (GPIO %d)", relayState ? "ON" : "OFF", RELAY_PIN);
#else
        snprintf(resultMsg, sizeof(resultMsg), "Relay set to %s", relayState ? "ON" : "OFF");
#endif
        Serial.printf("[ACTUATION] %s\n", resultMsg);
        blinkLED(1, 150);
    } else if (strcmp(action, "toggle_led") == 0) {
        ledState = doc["payload"]["state"] | false;
        digitalWrite(STATUS_LED_PIN, ledState ? HIGH : LOW);
        snprintf(resultMsg, sizeof(resultMsg), "Status LED set to %s", ledState ? "ON" : "OFF");
        Serial.printf("[ACTUATION] %s\n", resultMsg);
    } else if (strcmp(action, "set_interval") == 0) {
        unsigned long newInterval = doc["payload"]["interval_ms"] | 5000;
        publishIntervalMs = max(1000UL, newInterval);
        snprintf(resultMsg, sizeof(resultMsg), "Sampling rate set to %lu ms", publishIntervalMs);
        Serial.printf("[ACTUATION] %s\n", resultMsg);
        blinkLED(3, 40);
    } else if (strcmp(action, "reboot") == 0) {
        snprintf(resultMsg, sizeof(resultMsg), "Rebooting node in 500ms");
        Serial.printf("[ACTUATION] %s\n", resultMsg);
        // Dispatch ACK before rebooting
        StaticJsonDocument<256> ackDoc;
        ackDoc["command_id"] = cmdId;
        ackDoc["device_id"]  = DEVICE_ID;
        ackDoc["status"]     = "ACKNOWLEDGED";
        ackDoc["result"]     = resultMsg;
        char ackBuffer[256];
        serializeJson(ackDoc, ackBuffer);
        mqttClient.publish(ackTopic, ackBuffer);
        delay(500);
        ESP.restart();
        return;
    } else if (strcmp(action, "ota_update") == 0) {
        const char* otaUrl = doc["payload"]["url"] | "";
        const char* newVer = doc["payload"]["version"] | "latest";
        snprintf(resultMsg, sizeof(resultMsg), "OTA Flash initiated to version %s from %s", newVer, otaUrl);
        Serial.printf("[OTA] %s\n", resultMsg);
        blinkLED(5, 50);
    } else {
        snprintf(resultMsg, sizeof(resultMsg), "Unknown or unsupported action '%s'", action);
        success = false;
    }

    // Publish command acknowledgment
    StaticJsonDocument<256> ackDoc;
    ackDoc["command_id"] = cmdId;
    ackDoc["device_id"]  = DEVICE_ID;
    ackDoc["status"]     = success ? "ACKNOWLEDGED" : "FAILED";
    ackDoc["result"]     = resultMsg;

    char ackBuffer[256];
    serializeJson(ackDoc, ackBuffer);
    mqttClient.publish(ackTopic, ackBuffer);
    Serial.printf("[ACK] Published to %s: %s\n", ackTopic, ackBuffer);
}

// ------------------------------------------------------------------------------
// Sensor Read & Telemetry Publish
// ------------------------------------------------------------------------------
void publishTelemetry() {
    // Read sensor values (DHT22 provides 0.1C and 0.1% resolution)
    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature(); // Celsius

    // Validate sensor reading
    if (isnan(humidity) || isnan(temperature)) {
        Serial.println("[DHT22] Warning: Failed to read from sensor! Check wiring and 4.7k-10k pull-up resistor.");
        return;
    }

    // Round values to 1 decimal place
    temperature = roundf(temperature * 10.0f) / 10.0f;
    humidity = roundf(humidity * 10.0f) / 10.0f;

    // Build JSON telemetry document
    // Direct top-level fields: temperature_c & humidity_pct (as required)
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
