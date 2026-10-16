# 📡 Edge Device Firmware (ESP32 + DHT22)

[![PlatformIO](https://img.shields.io/badge/PlatformIO-Compatible-orange?style=flat&logo=platformio)](https://platformio.org)
[![Arduino IDE](https://img.shields.io/badge/Arduino_IDE-Compatible-00979D?style=flat&logo=arduino)](https://arduino.cc)
[![ESP32](https://img.shields.io/badge/Microcontroller-ESP32_WROOM_32-E7352C?style=flat&logo=espressif)](https://espressif.com)
[![DHT22](https://img.shields.io/badge/Sensor-DHT22_%2F_AM2302-green?style=flat)](https://www.adafruit.com/product/385)

Production-ready firmware for the ESP32 microcontroller paired with the DHT22 (AM2302) temperature and relative humidity sensor. Designed with robust industrial edge features including dual exponential reconnect backoff, non-blocking cooperative scheduling, and MQTT Last Will and Testament (LWT).

---

## 📑 Table of Contents

- [Firmware Architecture](#firmware-architecture)
- [Key Features](#key-features)
- [Hardware Wiring & Schematics](#hardware-wiring--schematics)
- [Directory Layout](#directory-layout)
- [Option A: Flashing with PlatformIO (Recommended)](#option-a-flashing-with-platformio-recommended)
- [Option B: Flashing with Arduino IDE](#option-b-flashing-with-arduino-ide)
- [Offline Telemetry Simulator (No Hardware Required)](#offline-telemetry-simulator-no-hardware-required)
- [Configuration Reference (`config.h`)](#configuration-reference-configh)

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
         |     Non-Blocking Loop     |           |     5-Second Cadence      |
         |  - PubSubClient.loop()    |           |  - Read DHT22 Temp & Hum  |
         |  - Monitor WiFi/MQTT link |           |  - Read WiFi RSSI & Uptime|
         |  - Handle Reconnects      |           |  - Publish JSON to MQTT   |
         +---------------------------+           +---------------------------+
```

---

## 🌟 Key Features

1. **Non-Blocking Cooperative Scheduling**: Avoids blocking calls (`delay()`), ensuring network heartbeats and MQTT keep-alive packets are processed smoothly without starvation.
2. **Dual Exponential Reconnect Backoff**:
   - Both WiFi and MQTT connections implement independent exponential backoff starting at **1 second** and doubling up to **60 seconds** max (`1s → 2s → 4s → 8s → 16s → 32s → 60s`).
   - Prevents network flood storms during router restarts or broker maintenance.
3. **MQTT Last Will and Testament (LWT)**:
   - Configures an automatic LWT payload (`{"status":"offline"}`) on topic `devices/<id>/status` with QoS 1 and retain flag enabled.
   - If an ESP32 loses power or network abruptly, the broker immediately alerts the backend.
4. **Hardware Status LED**:
   - Fast blink: Connecting to WiFi.
   - Slow pulse: Connecting to MQTT broker.
   - Solid / Periodic flash: Healthy operation and telemetry transmission.
5. **Rich Telemetry Packet**:
   - Reports ambient temperature (°C), relative humidity (% RH), WiFi RSSI (dBm), device uptime (seconds), and packet sequence counter.

---

## 🔌 Hardware Wiring & Schematics

Connect your DHT22 to the ESP32 DevKit using 3 jumper wires:

| DHT22 Pin (3-Pin Module) | DHT22 Pin (4-Pin Sensor) | ESP32 Pin | Description |
| :--- | :--- | :--- | :--- |
| **VCC / `+`** | Pin 1 (Left) | **3.3V** (or 5V/VIN) | Power supply |
| **DATA / `out`**| Pin 2 | **GPIO 4** | Digital bidirectional data signal |
| *(None)* | Pin 3 | **NC** | Not connected |
| **GND / `-`** | Pin 4 (Right) | **GND** | Ground reference |

> **Important**: If you are using a bare 4-pin DHT22 sensor, place a **10kΩ pull-up resistor** between Pin 1 (VCC) and Pin 2 (DATA). Most 3-pin breakout modules already have this pull-up resistor built-in on the PCB.

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
│   └── simulate_nodes.go     # Go-based MQTT multi-node simulator
└── README.md
```

---

## 🛠️ Option A: Flashing with PlatformIO (Recommended)

PlatformIO automatically downloads the ESP32 toolchain, framework, and required C++ libraries.

### 1. Configure Credentials
Edit `firmware/esp32-dht22/include/config.h` with your WiFi network and PC's IP address:
```cpp
#define WIFI_SSID       "Your_WiFi_SSID"
#define WIFI_PASSWORD   "Your_WiFi_Password"
#define MQTT_BROKER     "192.168.1.100" // Your PC/Server IP running Mosquitto
#define MQTT_PORT       1883

#define TENANT_ID       "a0000000-0000-0000-0000-000000000001"
#define DEVICE_ID       "esp32-dht22-01"
#define DEVICE_NAME     "Laboratory ESP32 Node 1"
```

### 2. Build and Flash
Connect your ESP32 board to your PC via USB:
```bash
cd firmware/esp32-dht22
pio run --target upload
```

### 3. Open Serial Monitor
```bash
pio device monitor -b 115200
```
You will see WiFi connection logs, MQTT connection status, and live sensor transmissions every 5 seconds.

---

## 🛠️ Option B: Flashing with Arduino IDE

### 1. Install ESP32 Board Support
In Arduino IDE:
1. Go to **File → Preferences**.
2. Add to *Additional Boards Manager URLs*:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Open **Tools → Board → Boards Manager**, search for `esp32` and install the package by Espressif.

### 2. Install Required Libraries
Open **Tools → Manage Libraries...** and install:
- **ArduinoJson** (version 7.x by Benoît Blanchon)
- **PubSubClient** (by Nick O'Leary)
- **DHT sensor library** (by Adafruit)
- **Adafruit Unified Sensor** (by Adafruit)

### 3. Open and Upload
1. Open `firmware/arduino-ide/esp32_dht22/esp32_dht22.ino`.
2. Edit `config.h` with your WiFi and MQTT credentials.
3. Select board **ESP32 Dev Module** and choose your COM port.
4. Click **Upload** and open Serial Monitor at **115200 baud**.

---

## 💻 Offline Telemetry Simulator (No Hardware Required)

You can test the entire backend ingestion pipeline, database writes, and frontend live charts without physical microcontrollers using the included Go simulator:

```bash
go run firmware/tools/simulate_nodes.go -broker tcp://localhost:1883 -nodes 2
```

**Parameters:**
- `-broker`: Mosquitto broker address (default: `tcp://localhost:1883`)
- `-nodes`: Number of simulated ESP32 devices to run concurrently (e.g. `1` or `2`)
- `-interval`: Publish interval in seconds (default: `5s`)

---

## ⚙️ Configuration Reference (`config.h`)

| Definition | Default Example | Description |
| :--- | :--- | :--- |
| `WIFI_SSID` | `"Your_SSID"` | 2.4GHz WiFi network name |
| `WIFI_PASSWORD` | `"Your_Password"` | WiFi WPA2/WPA3 password |
| `MQTT_BROKER` | `"192.168.1.100"` | Local IP of your PC or server hosting Mosquitto |
| `MQTT_PORT` | `1883` | MQTT port (standard unencrypted port) |
| `TENANT_ID` | `"a0000000-..."` | Target multi-tenant workspace UUID |
| `DEVICE_ID` | `"esp32-dht22-01"` | Unique identifier for the edge board |
| `DHT_PIN` | `4` | ESP32 GPIO connected to DHT22 DATA line |
| `DHT_TYPE` | `DHT22` | Sensor type (`DHT22` / `AM2302`) |
| `PUBLISH_INTERVAL_MS`| `5000` | Telemetry transmission period (5,000 ms) |
