/**
 * Utility functions for generating Tenant IDs, Channel IDs, and Secret Keys
 */

export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateChannelId(name = '') {
  const cleanName = name ? name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 10) : 'node';
  const randPart = Math.random().toString(36).substring(2, 8);
  return `chan-${cleanName}-${randPart}`;
}

export function generateSecretKey() {
  const bytes = new Uint8Array(20);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `iot_sec_${hex}`;
}

export function generateConfigCode({
  tenantId,
  channelId,
  deviceId,
  secretKey,
  brokerHost = '192.168.1.100',
  brokerPort = 1883,
  wifiSsid = 'YOUR_WIFI_SSID',
  wifiPassword = 'YOUR_WIFI_PASSWORD',
}) {
  return `// ==============================================================================
// ESP32 Provisioning Config for IoT Platform
// Generated automatically from IoT Platform Dashboard
// ==============================================================================
#ifndef CONFIG_H
#define CONFIG_H

// WiFi Credentials
#define WIFI_SSID             "${wifiSsid}"
#define WIFI_PASSWORD         "${wifiPassword}"

// MQTT Broker
#define MQTT_BROKER           "${brokerHost}"
#define MQTT_PORT             ${brokerPort}

// Authentication & Identity
#define TENANT_ID             "${tenantId}"
#define CHANNEL_ID            "${channelId}"
#define DEVICE_ID             "${deviceId}"
#define MQTT_USER             "${deviceId}"
#define MQTT_PASSWORD         "${secretKey}"

// MQTT Topics
#define MQTT_TOPIC_PREFIX     "devices"
#define MQTT_TELEMETRY_TOPIC  "devices/${deviceId}/telemetry"

// Hardware Pinout
#define DHT_PIN               4     // ESP32 GPIO connected to DHT22 DATA
#define DHT_TYPE              DHT22
#define STATUS_LED_PIN        2

// Polling & Reconnect Settings
#define PUBLISH_INTERVAL_MS   5000  // 5 seconds
#define INITIAL_BACKOFF_MS    1000  // 1 second
#define MAX_BACKOFF_MS        60000 // 60 seconds

#endif // CONFIG_H`;
}
