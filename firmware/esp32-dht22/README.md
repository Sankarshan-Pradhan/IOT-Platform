# ESP32 + DHT22 Firmware (Days 3–4)

Production-grade Arduino/PlatformIO firmware for 1–2 ESP32 nodes connected to DHT22 temperature and humidity sensors.

## Features
- **Sensor Polling**: Reads ambient temperature (°C) and relative humidity (%) from DHT22 every **5 seconds** (configurable dynamically).
- **JSON Telemetry**: Publishes standardized JSON payloads with sequence counter and uptime to `devices/<DEVICE_ID>/telemetry` (QoS 1).
- **Two-Way Downlink Actuation**: Subscribes to `devices/<DEVICE_ID>/commands` and acknowledges receipts on `devices/<DEVICE_ID>/command_ack`:
  - `set_relay`: Switches AC/DC relay module connected to GPIO 26.
  - `toggle_led`: Toggles onboard status beacon LED on GPIO 2.
  - `set_interval`: Dynamically changes telemetry publishing interval (1s to 60s).
  - `reboot`: Safely restarts microcontroller via `ESP.restart()`.
  - `ota_update`: Initiates wireless firmware flashing via `HTTPUpdate`.
- **Pre-Update OTA Flashing**: Wirelessly downloads and flashes `.bin` binaries over Wi-Fi with dual-partition fail-safe fallback.
- **MQTT Last Will & Testament (LWT)**: Configures retained `"offline"` payload on `devices/<DEVICE_ID>/status`, with retained `"online"` published upon connection.
- **Dual Reconnect Exponential Backoff**:
  - **WiFi Backoff**: Exponential backoff from 1s up to 60s (`1s → 2s → 4s → ... → 60s`).
  - **MQTT Backoff**: Exponential backoff from 1s up to 60s.
- **Non-blocking Loop**: Zero `delay()` in the main loop to guarantee keep-alive packets and prevent watchdog timeouts (WDT).
- **Status LED Indication**:
  - 2 quick blinks when MQTT connects.
  - 30ms pulse on each successful telemetry transmission.

---

## Directory Structure

```
firmware/esp32-dht22/
├── platformio.ini       # PlatformIO build configuration
├── include/
│   ├── config.h         # Active configuration (WiFi, broker, device ID)
│   └── config.h.example # Template configuration
├── src/
│   └── main.cpp         # Main firmware application
└── README.md            # This documentation
```

---

## Hardware Wiring

For comprehensive pinout diagrams and breadboard schematics, refer to:
👉 [Wiring & Hardware Guide (docs/esp32_dht22_wiring_guide.md)](file:///D:/iot-platform/docs/esp32_dht22_wiring_guide.md)

### Quick Pin Connections:
| DHT22 Sensor Pin | ESP32 DevKit Pin | Notes |
|---|---|---|
| **VCC / `+` / Pin 1** | **3V3** | Connect to 3.3V power (safe logic level) |
| **DATA / `out` / Pin 2** | **GPIO 4** | Recommended (or GPIO 22). Requires 10kΩ pull-up to 3.3V if using 4-pin bare sensor |
| **NC / Pin 3** | Not Connected | Leave disconnected (4-pin sensor only) |
| **GND / `-` / Pin 4** | **GND** | Ground connection |

---

## Configuration

Edit `include/config.h`:

```cpp
// 1. Your Local WiFi Credentials
#define WIFI_SSID             "Your_Home_or_Lab_WiFi"
#define WIFI_PASSWORD         "Your_WiFi_Password"

// 2. MQTT Broker IP (Host machine running Mosquitto)
// Run `ipconfig` on your PC to find your local IPv4 address (e.g., 192.168.1.50)
#define MQTT_BROKER           "192.168.1.50"
#define MQTT_PORT             1883

// 3. Device Identification
// Set to "esp32-dht22-01" for Board 1, or "esp32-dht22-02" for Board 2
#define DEVICE_ID             "esp32-dht22-01"
```

---

## Flashing & Uploading

### Option A: Using PlatformIO (Recommended)

1. Open `D:\iot-platform` in VS Code with the PlatformIO extension installed, or use the PlatformIO CLI.
2. Build the project:
   ```bash
   pio run
   ```
3. Connect your ESP32 board via USB.
4. Upload firmware:
   ```bash
   pio run --target upload
   ```
5. Open Serial Monitor (115200 baud):
   ```bash
   pio device monitor -b 115200
   ```

### Option B: Using Arduino IDE

1. Open `firmware/arduino-ide/esp32_dht22/esp32_dht22.ino`.
2. Install required libraries via **Sketch -> Include Library -> Manage Libraries**:
   - `DHT sensor library` by Adafruit
   - `Adafruit Unified Sensor` by Adafruit
   - `PubSubClient` by Nick O'Leary
   - `ArduinoJson` by Benoit Blanchon (v6 or v7)
3. Select your board under **Tools -> Board -> ESP32 Arduino -> ESP32 Dev Module**.
4. Select the correct COM port under **Tools -> Port**.
5. Click **Upload**.

---

## Expected Serial Output

```
==================================================
   IoT Platform: ESP32 + DHT22 Firmware Node
==================================================
Device ID:      esp32-dht22-01
Tenant ID:      a0000000-0000-0000-0000-000000000001
DHT Pin:        GPIO 4 (Type: DHT22)
Telemetry Topic:devices/esp32-dht22-01/telemetry
Publish Rate:   Every 5000 ms
==================================================
[DHT22] Sensor initialized.
[WiFi] Initiating connection to SSID: 'HomeWiFi'...
[WiFi] Connected! IP Address: 192.168.1.120 (RSSI: -58 dBm)
[MQTT] Connecting to broker 192.168.1.50:1883 as 'esp32-dht22-01' (backoff: 1000 ms)...
[MQTT] Connected to Mosquitto broker successfully!
[PUB] [5 s] Temp: 24.3 C | Humidity: 55.4 % | RSSI: -58 dBm | Topic: devices/esp32-dht22-01/telemetry
[PUB] [10 s] Temp: 24.4 C | Humidity: 55.2 % | RSSI: -57 dBm | Topic: devices/esp32-dht22-01/telemetry
[PUB] [15 s] Temp: 24.3 C | Humidity: 55.5 % | RSSI: -58 dBm | Topic: devices/esp32-dht22-01/telemetry
```

---

## Telemetry Format

Each transmission sends the following JSON payload:

```json
{
  "device_id": "esp32-dht22-01",
  "tenant_id": "a0000000-0000-0000-0000-000000000001",
  "temperature_c": 24.3,
  "humidity_pct": 55.4,
  "seq": 1,
  "uptime_s": 5,
  "wifi_rssi": -58
}
```
