# 📡 Edge Device Firmware (ESP32 + DHT22)

[![PlatformIO](https://img.shields.io/badge/PlatformIO-Compatible-orange?style=flat&logo=platformio)](https://platformio.org)
[![Arduino IDE](https://img.shields.io/badge/Arduino_IDE-Compatible-00979D?style=flat&logo=arduino)](https://arduino.cc)
[![ESP32](https://img.shields.io/badge/Microcontroller-ESP32_WROOM_32-E7352C?style=flat&logo=espressif)](https://espressif.com)
[![DHT22](https://img.shields.io/badge/Sensor-DHT22_%2F_AM2302-green?style=flat)](https://www.adafruit.com/product/385)

Production-ready firmware for the ESP32 microcontroller paired with the DHT22 (AM2302) temperature and relative humidity sensor. Designed with robust industrial edge features including two-way downlink actuation, remote OTA flashing, dual exponential reconnect backoff, non-blocking cooperative scheduling, and MQTT Last Will and Testament (LWT).

---

## 📑 Table of Contents

- [Firmware Architecture](#-firmware-architecture)
- [Key Features](#-key-features)
- [Two-Way Downlink Control & Actuation](#-two-way-downlink-control--actuation)
- [Over-the-Air (OTA) Firmware Flashing](#-over-the-air-ota-firmware-flashing)
- [Hardware Wiring & Schematics](#-hardware-wiring--schematics)
- [Directory Layout](#-directory-layout)
- [Flashing with PlatformIO (Recommended)](#-option-a-flashing-with-platformio-recommended)
- [Flashing with Arduino IDE](#-option-b-flashing-with-arduino-ide)
- [Offline Telemetry Simulator (No Hardware Required)](#-offline-telemetry-simulator-no-hardware-required)
- [Configuration Reference (`config.h`)](#-configuration-reference-configh)

---

## ⚡ Firmware Architecture

```
                       +---------------------------------------+
                       |             ESP32 Bootup              |
                       +---------------------------------------+
                                           |
                                           v
                       +---------------------------------------+
                       |  WiFi Connection (Dual Backoff 1-60s) |
                       +---------------------------------------+
                                           |
                                           v
                       +---------------------------------------+
                       |  MQTT Broker Connect (With LWT)       |
                       +---------------------------------------+
                                           |
                       +-------------------+-------------------+
                       |                                       |
                       v                                       v
         +---------------------------+           +---------------------------+
         |     Non-Blocking Loop     |           |     Telemetry & Commands  |
         |  - PubSubClient.loop()    |           |  - Upstream: 5s telemetry |
         |  - Subscribed to commands |           |  - Downlink: Relays & LED |
         |  - Handle Reconnects      |           |  - OTA HTTPUpdate handler |
         +---------------------------+           +---------------------------+
```

---

## 🌟 Key Features

1. **Two-Way Communication**: Telemetry flows upstream (`devices/<id>/telemetry`) and control commands flow downstream (`devices/<id>/commands`).
2. **Non-Blocking Cooperative Scheduling**: Avoids blocking calls (`delay()`), ensuring network heartbeats and MQTT keep-alive packets are processed smoothly without starvation.
3. **Dual Exponential Reconnect Backoff**:
   - Both WiFi and MQTT connections implement independent exponential backoff starting at **1 second** and doubling up to **60 seconds** max (`1s → 2s → 4s → 8s → 16s → 32s → 60s`).
   - Prevents network flood storms during router restarts or broker maintenance.
4. **MQTT Last Will and Testament (LWT) & Status Lifecycle**:
   - Configures an automatic LWT payload (`"offline"`) on topic `devices/<id>/status` with QoS 1 and retain flag enabled during initial MQTT connect handshake.
   - Upon successful broker connection, immediately publishes `"online"` with retain flag to notify backend and UI clients.
   - If an ESP32 loses power or drops Wi-Fi abruptly, Mosquitto dispatches the LWT payload, updating the database status and broadcasting a `device_status` SSE event to the React dashboard in real-time.
5. **Hardware Status LED & Relay Output**:
   - Supports GPIO 26 for relay switching and GPIO 2 for status beacon LED.
6. **Rich Telemetry Packet**:
   - Reports ambient temperature (°C), relative humidity (% RH), WiFi RSSI (dBm), device uptime (seconds), and packet sequence counter.

---

## 🎮 Two-Way Downlink Control & Actuation

The firmware subscribes to `devices/<DEVICE_ID>/commands` and handles JSON control payloads:

| Action | Payload Example | Hardware Execution |
|---|---|---|
| `set_relay` | `{"state": true, "relay_id": 1}` | Energizes or opens relay GPIO 26 pin |
| `toggle_led` | `{"state": true}` | Illuminates or extinguishes status LED on GPIO 2 |
| `set_interval` | `{"interval_ms": 2000}` | Dynamically adjusts DHT22 publishing interval (1s – 60s) |
| `reboot` | `{}` | Dispatches acknowledgment and restarts ESP32 (`ESP.restart()`) |
| `ota_update` | `{"url": "http://.../firmware.bin", "version": "v1.1.0"}` | Initiates OTA flashing via HTTPUpdate |

After executing each command, the node publishes an acknowledgment packet to `devices/<DEVICE_ID>/command_ack`:
```json
{
  "command_id": "cmd-12345",
  "device_id": "esp32-dht22-01",
  "status": "ACKNOWLEDGED",
  "result": "Relay set to ON"
}
```

---

## 🚀 Over-the-Air (OTA) Firmware Flashing

When an `ota_update` command is received:
1. The firmware extracts the binary download URL and optional firmware version string from the JSON command payload.
2. Dispatches an immediate pre-update acknowledgment to `devices/<DEVICE_ID>/command_ack` with status `ACKNOWLEDGED` and result `OTA Flash initiated` (allowing the dashboard to render a download progress indicator).
3. Invokes the native ESP32 `httpUpdate.update(wifiClient, otaUrl)` engine.
4. Streams and writes the compiled binary into the secondary flash partition (`OTA_0` / `OTA_1`).
5. Upon successful checksum validation and partition switch, the ESP32 automatically reboots and registers with the new firmware version.

---

## 🔌 Hardware Wiring & Schematics

Connect your DHT22 and Relay to the ESP32 DevKit:

| Component Pin | ESP32 Pin | Description |
| :--- | :--- | :--- |
| **DHT22 DATA** | **GPIO 4** | Digital bidirectional data signal (10kΩ pull-up to 3.3V) |
| **Relay IN** | **GPIO 26** | Digital output control line for AC/DC power relay |
| **Status LED** | **GPIO 2** | Onboard status beacon indicator |
| **VCC / `+`** | **3.3V / VIN** | Power supply rail |
| **GND / `-`** | **GND** | Ground reference |

Detailed schematics and pinout diagrams are available in the [Hardware Wiring Guide](../docs/esp32_dht22_wiring_guide.md).

---

## 📁 Directory Layout

```
firmware/
├── esp32-dht22/              # Production PlatformIO project
│   ├── platformio.ini        # Target esp32dev, framework arduino, libraries
│   ├── include/
│   │   ├── config.h          # Active credentials (WiFi, MQTT broker, Tenant ID)
│   │   └── config.h.example  # Configuration template
│   └── src/
│       └── main.cpp          # Full non-blocking firmware implementation
├── arduino-ide/              # Standalone Arduino IDE sketches
│   └── esp32_dht22/
│       ├── esp32_dht22.ino   # Arduino sketch (.ino)
│       └── config.h          # Configuration header
├── tools/
│   └── simulate_nodes.go     # Go-based MQTT multi-node simulator with downlink ACK
└── README.md
```

---

## 🛠️ Option A: Flashing with PlatformIO (Recommended)

### 1. Configure Credentials
Edit `firmware/esp32-dht22/include/config.h`:
```cpp
#define WIFI_SSID       "Your_WiFi_SSID"
#define WIFI_PASSWORD   "Your_WiFi_Password"
#define MQTT_BROKER     "192.168.1.100" // PC IP hosting Mosquitto
#define MQTT_PORT       1883
#define DEVICE_ID       "esp32-dht22-01"
```

### 2. Build and Flash
```bash
cd firmware/esp32-dht22
pio run --target upload
pio device monitor -b 115200
```

---

## 🛠️ Option B: Flashing with Arduino IDE

1. Install ESP32 board support via **Boards Manager**.
2. Install required libraries: `ArduinoJson`, `PubSubClient`, `DHT sensor library`.
3. Open `firmware/arduino-ide/esp32_dht22/esp32_dht22.ino`.
4. Select board **ESP32 Dev Module**, choose COM port, and upload.

---

## 💻 Offline Telemetry Simulator (No Hardware Required)

You can simulate multiple nodes with upstream telemetry AND two-way downlink command execution:
```bash
go run firmware/tools/simulate_nodes.go -broker tcp://localhost:1883 -nodes 2
```
*The simulator listens for downlink commands (`set_relay`, `toggle_led`, `reboot`, `set_interval`, `ota_update`) and automatically publishes acknowledgments to `devices/<id>/command_ack`.*

---

## ⚙️ Configuration Reference (`config.h`)

| Definition | Default Example | Description |
| :--- | :--- | :--- |
| `WIFI_SSID` | `"Your_SSID"` | 2.4GHz WiFi network name |
| `WIFI_PASSWORD` | `"Your_Password"` | WiFi password |
| `MQTT_BROKER` | `"192.168.1.100"` | Local IP of your PC or server hosting Mosquitto |
| `MQTT_PORT` | `1883` | MQTT port |
| `TENANT_ID` | `"a0000000-..."` | Target multi-tenant workspace UUID |
| `DEVICE_ID` | `"esp32-dht22-01"` | Unique identifier for the edge board |
| `DHT_PIN` | `4` | ESP32 GPIO for DHT22 DATA line |
| `RELAY_PIN` | `26` | ESP32 GPIO for AC/DC power relay |
| `STATUS_LED_PIN`| `2` | ESP32 GPIO for status beacon LED |
| `PUBLISH_INTERVAL_MS`| `5000` | Telemetry transmission period (5,000 ms) |
