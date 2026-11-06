# 🌐 Industrial IoT Platform Mono-Repo

[![Go Version](https://img.shields.io/badge/Go-1.24+-00ADD8?style=flat&logo=go)](https://golang.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat&logo=vite)](https://vitejs.dev)
[![TimescaleDB](https://img.shields.io/badge/TimescaleDB-PostgreSQL_16-FDB515?style=flat&logo=postgresql)](https://timescale.com)
[![MQTT](https://img.shields.io/badge/MQTT-Mosquitto_2.0-660066?style=flat&logo=eclipsemosquitto)](https://mosquitto.org)
[![ESP32](https://img.shields.io/badge/Firmware-ESP32_+_DHT22-E7352C?style=flat&logo=espressif)](https://espressif.com)
[![Docker](https://img.shields.io/badge/Docker-Compose_Ready-2496ED?style=flat&logo=docker)](https://docker.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v3-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com)

A high-performance, enterprise-grade multi-tenant IoT platform designed for high-throughput time-series telemetry ingestion, zero-latency streaming, two-way hardware actuation, automated alert dispatching, TimescaleDB continuous aggregates, data exports, remote OTA firmware updates, and single-command containerization.

---

## ⚡ Quick Start for New Users (1-Command Boot)

You can run the **entire platform** (Database, MQTT Broker, Backend API, and Frontend Dashboard) with a single command:

### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.
- [Git](https://git-scm.com/) installed.

### 2. Launch Stack
```bash
git clone <repository-url>
cd iot-platform
docker compose up -d --build
```

### 3. Open Application
* **Web Dashboard:** [`http://localhost:3000`](http://localhost:3000)
* **Backend Healthcheck:** [`http://localhost:8080/health`](http://localhost:8080/health)

**Default Superuser Credentials:**
| Field | Value |
|---|---|
| **Username** | `admin` |
| **Password** | `admin123` |

### 4. Optional: Stream Demo Data Without Hardware
To simulate virtual ESP32 sensor nodes streaming live telemetry into your dashboard:
```bash
go run firmware/tools/simulate_nodes.go
```

> **To stop all services later:** Run `docker compose down`.

---

## 🧭 Complete End-to-End User Journey

```mermaid
flowchart LR
    A["1. Sign Up & Login"] --> B["2. Create Workspace"]
    B --> C["3. Groups & Channels"]
    C --> D["4. Add / Assign Devices"]
    D --> E["5. Flash ESP32 Hardware"]
    E --> F["6. Live Monitoring & Alerts"]
```

### Step 1: Sign Up & Login
1. Open [`http://localhost:3000`](http://localhost:3000).
2. Click **Create an account** on the login screen.
3. Enter your **Full Name**, **Mobile Number**, **Email**, **Username**, and **Password**.
4. Log into your dedicated operator session.

### Step 2: Create Your Workspace (Multi-Tenant Isolation)
1. On initial login, new users are greeted by the **Step 1: Workspace Setup** onboarding card.
2. Enter a **Workspace Name** (e.g. *Smart Factory Alpha*, *Greenhouse Zone 1*) and slug.
3. Click **Create Workspace & Continue**.
4. All telemetry, channels, devices, guardrails, and alarms are isolated strictly to your workspace.
5. Users can also delete workspaces (including their default workspace) anytime. When 0 workspaces remain, the view seamlessly resets to the setup card.

### Step 3: Groups & Telemetry Channels
1. In the sidebar, click **Groups & Channels**.
2. Click **+ Add Channel**:
   - **Channel Name**: e.g., *Deep Freeze Units*
   - **Group Name**: e.g., *Refrigeration*, *HVAC*, *Assembly Line*
   - **Topic Route**: e.g., `channels/chan-cold-01/telemetry`
3. Channels organize edge devices into logical zones and unified MQTT topics.

### Step 4: Register or Assign Sensor Devices
The platform provides flexible device management:

- **Assign Existing Devices into a Channel (Recommended)**:
  - On any channel card, click **+ Add Device**.
  - Under the **"Select Existing Device"** tab, pick any previously created sensor in the workspace from the dropdown.
  - Click **Assign Device to Channel** (or **Move Device to Channel**) to link it with 1 click.
  - Channels dynamically display `Nodes: X connected` and render clickable badges for each device (`[⚡ esp32-sensor-01]`). Click `(×)` on any badge to unlink a device back to standalone status.
- **Register Brand New Device**:
  - In **Clients / Devices** or inside the modal's **"Register Brand New Device"** tab, enter a Device ID (e.g. `esp32-dht22-01`), display name, hardware type, and optional channel.

### Step 5: Connect Physical Hardware (ESP32)
1. Connect your physical ESP32 to your computer via USB.
2. Open the code in **Arduino IDE** or **PlatformIO** (located in `firmware/esp32-dht22` or `firmware/arduino-ide`).
3. Set your local Wi-Fi SSID, Password, and your computer's local LAN IP as the MQTT Host (`192.168.x.x:1883`).
4. Flash the code via USB. Once flashed, the ESP32 connects to Wi-Fi and streams data independently without needing the USB cable!

### Step 6: Live Telemetry Visualization
- Navigate to **Live Dashboard**.
- Pick any device in the top **Active Sensors** selector strip.
- View **Live Metric Cards** (Temperature, Humidity, Heat Index with Min/Max).
- Analyze **Interactive Charts** (continuous 5s updates + zero-latency SSE).
- Toggle **Compare Mode** to evaluate two sensors side-by-side.
- Export sensor datasets to **CSV** or **JSON** with one click.

---

## 📡 What is Over-The-Air (OTA) Update? (Simple Explanation)

**Over-The-Air (OTA)** means updating your ESP32's software **wirelessly over Wi-Fi without needing a USB cable**.

### The Problem It Solves
Imagine an ESP32 mounted 15 feet high on a factory ceiling or sealed inside a waterproof box. If you need to fix a bug or change calculation logic:
- **Without OTA**: You have to bring a ladder and a laptop, climb up, plug in a USB cable, and re-flash the board.
- **With OTA**: You compile your code on your laptop, upload the `.bin` file to the platform dashboard, and click **Trigger OTA**. The ESP32 downloads the update over Wi-Fi, flashes its own memory, and restarts in 10 seconds!

### Fail-Safe "Two-Room" Partitioning
The ESP32 flash memory is split into two slots (**OTA_0** and **OTA_1**):
1. While your device runs in Slot A, it downloads the new code into Slot B.
2. Only after the file is 100% verified does it switch to Slot B and reboot.
3. If Wi-Fi drops midway through downloading, the device safely discards the download and keeps running in Slot A — **it never bricks or dies**.

---

## 🏛️ System Architecture

```
                                  +---------------------------------------+
                                  |   ESP32 Microcontroller Nodes         |
                                  |   (DHT22 Temp, Humidity, Relays, LED) |
                                  +---------------------------------------+
                                           |                      ^
            Upstream Telemetry (Every 5s)  |                      | Downlink Commands
            Topic: devices/<id>/telemetry  |                      | Topic: devices/<id>/commands
            QoS 1, LWT: "offline"          v                      | ACK: devices/<id>/command_ack
                                  +---------------------------------------+
                                  |   Eclipse Mosquitto Broker (:1883)    |
                                  |   - Native TCP MQTT on Port 1883      |
                                  |   - WebSocket MQTT on Port 9001       |
                                  +---------------------------------------+
                                                       |
                                                       | Paho MQTT Subscriber / Publisher
                                                       v
                                  +---------------------------------------+
                                  |         Go Backend Server (:8080)     |
                                  |  - Dual Mode (TimescaleDB + In-Memory)|
                                  |  - SSE Broker (:stream, 0ms latency)  |
                                  |  - Device Registry & CRUD Handlers    |
                                  |  - Dynamic Channel Aggregation Engine |
                                  |  - Outbound Alert Dispatchers         |
                                  |  - Continuous Rollups & Downsampler   |
                                  |  - CSV/JSON Data Streaming Exporter   |
                                  |  - OTA Firmware Binary Server         |
                                  +---------------------------------------+
                                           |                      |
             SQL Writes & Continuous Aggs  |                      | Real-Time SSE Stream / REST API
                                           v                      v
        +-------------------------------------+        +-------------------------------------+
        |     TimescaleDB (PostgreSQL 16)     |        |   React 18 + Vite Dashboard (:3000) |
        |  ├── users, tenants, channels       |        |  ├── Workspaces & Tenancy Manager   |
        |  ├── devices (channel_id FK)        |        |  ├── Groups & Telemetry Channels    |
        |  ├── telemetry (Hypertable)         |        |  ├── Assign Existing Device Modal   |
        |  ├── telemetry_1m/5m/1h (Rollups)   |        |  ├── Live 0ms SSE Telemetry Stream  |
        |  ├── device_commands & channels     |        |  ├── Device Control Panel (Relays)  |
        |  ├── rules & alarms                 |        |  ├── Rollup Downsampling (1m/5m/1h) |
        |  └── 30-Day Chunk Retention Policy  |        |  └── CSV/JSON Data Export Trigger   |
        +-------------------------------------+        +-------------------------------------+
```

---

## 🚀 8 Enterprise Production Features

### 1. Two-Way Downlink Device Control & Actuation
- **MQTT Topics:** Dispatches to `devices/{id}/commands`, receives ACKs on `devices/{id}/command_ack`.
- **Supported Actions:**
  - `set_relay`: Turn physical AC/DC equipment ON/OFF (`state: true | false`).
  - `toggle_led`: Control onboard status LED.
  - `set_interval`: Adjust sensor sampling frequency remotely (1s to 60s).
  - `reboot`: Trigger remote microcontroller reboot via `ESP.restart()`.
- **UI:** Interactive controls in [`DeviceControlPanel.jsx`](frontend/src/components/DeviceControlPanel.jsx).

### 2. Zero-Latency Real-Time Streaming (Server-Sent Events)
- **SSE Broker:** [`backend/handlers/sse.go`](backend/handlers/sse.go) on `GET /api/v1/telemetry/stream`.
- **Events Broadcasted:** `telemetry` (0ms push), `alarm` (guardrail violations), `command_ack` (device receipts).
- **UI:** Animated pulse badge with automatic fallback to 5s polling.

### 3. Hierarchical Groups, Channels & Device Linking
- **Relational Schema:** `tenants` → `channels` → `devices`.
- **Channel Assignment:** Assign, move, or unlink previously created devices with 1 click.
- **Dynamic Node Counting:** Channels report real connected devices count via `devices_count` subqueries.

### 4. Outbound Alert Notification Channels
- **Supported Providers:** **Discord** Webhooks, **Slack** Incoming Webhooks, and custom **HTTP POST Webhooks**.
- **Automated Dispatch:** Triggers instant alert payloads whenever a `CRITICAL` alarm fires.

### 5. TimescaleDB Continuous Aggregates & Downsampling
- **Continuous Views:** 1-minute (`telemetry_1m`), 5-minute (`telemetry_5m`), and 1-hour (`telemetry_1h`) rollups.
- **Data Retention Policy:** Automatically drops raw hypertable data older than 30 days.

### 6. Historical Data Export & Reporting (CSV & JSON)
- **Streaming Exporter:** [`backend/handlers/export.go`](backend/handlers/export.go) on `GET /api/v1/devices/{id}/telemetry/export`.
- **Formats:** Download CSV or JSON formatted history straight from the chart toolbar.

### 7. Over-the-Air (OTA) Updates & Device Provisioning
- **Per-Device Auth Tokens:** Secure token generation and rotation endpoint `POST /api/v1/devices/{id}/token`.
- **Binary Distribution:** Multipart `.bin` binary uploads, SHA-256 verification, and downlink OTA commands.

### 8. End-to-End Multi-Stage Containerization
- **Backend:** `golang:1.24-alpine` → `alpine:3.20` with integrated healthchecks.
- **Frontend:** `node:20-alpine` → `nginx:alpine` with reverse proxy and SSE buffering disabled.
- **Orchestration:** Single root [`docker-compose.yml`](docker-compose.yml).

---

## 🔌 API Reference Summary

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Register new user account |
| `POST` | `/api/v1/auth/login` | Authenticate and obtain JWT token |
| `GET` | `/api/v1/tenants` | List workspaces for caller |
| `POST` | `/api/v1/tenants` | Create new workspace |
| `DELETE` | `/api/v1/tenants/{id}` | Delete workspace (including default org) |
| `GET` | `/api/v1/channels` | List channels with dynamic `devices_count` |
| `POST` | `/api/v1/channels` | Create telemetry channel |
| `DELETE` | `/api/v1/channels/{id}` | Delete channel |
| `GET` | `/api/v1/devices` | Query devices (filter by `tenant_id` / `channel_id`) |
| `POST` | `/api/v1/devices` | Register new sensor device |
| `PATCH` | `/api/v1/devices/{id}` | Update device (assign/unlink channel, name, type) |
| `DELETE` | `/api/v1/devices/{id}` | Delete device and its telemetry |
| `POST` | `/api/v1/devices/{id}/telemetry` | HTTP telemetry ingestion |
| `GET` | `/api/v1/devices/{id}/telemetry/latest` | Fetch latest telemetry record |
| `GET` | `/api/v1/devices/{id}/telemetry/history` | Query time-series telemetry history |
| `GET` | `/api/v1/devices/{id}/telemetry/export` | Stream CSV or JSON historical data |
| `GET` | `/api/v1/telemetry/stream` | Zero-latency Server-Sent Events (SSE) stream |
| `POST` | `/api/v1/devices/{id}/commands` | Dispatch downlink hardware actuation command |
| `POST` | `/api/v1/ota/firmware` | Upload `.bin` firmware binary for OTA |
| `POST` | `/api/v1/devices/{id}/ota` | Trigger wireless Over-The-Air flashing |

---

## 🛠️ Services Breakdown

| Service | Technology | Port | Purpose |
|---|---|---|---|
| **Database** | TimescaleDB (Postgres 16) | `5433` | Time-series hypertables, continuous aggregates, multi-tenancy |
| **MQTT Broker** | Eclipse Mosquitto 2.0 | `1883`, `9001` | High-throughput telemetry ingestion & downlink commands |
| **Backend API** | Go 1.24 | `8080` | REST API, SSE streaming, downsampler, alert dispatcher |
| **Frontend UI** | React 18 + Vite + Tailwind | `3000` | Management cockpit, charts, device control, guardrails |
| **Edge Firmware** | ESP32 (C++ / PlatformIO) | — | Hardware sensor sampling, relay actuation, OTA flashing |
| **Simulator** | Go CLI | — | Virtual sensor nodes for testing without hardware |

---

## 💻 Local Development Setup (Without Docker)

```bash
# 1. Backend Service (Auto-falls back to in-memory mode if DB is offline)
cd backend
go run main.go

# 2. Frontend Dashboard
cd frontend
npm install
npm run dev
```

---

## 🔌 Firmware Flashing Guide (Physical ESP32)

1. Review the [Hardware Wiring Guide](docs/esp32_dht22_wiring_guide.md):
   - **DHT22 DATA** → GPIO 4
   - **Relay IN** → GPIO 26
   - **Status LED** → GPIO 2
2. Edit Wi-Fi credentials and your computer's LAN IP in `firmware/esp32-dht22/include/config.h`.
3. Flash using PlatformIO:
   ```bash
   cd firmware/esp32-dht22
   pio run --target upload
   pio device monitor -b 115200
   ```
*(Arduino IDE users can open `firmware/arduino-ide/esp32_dht22/esp32_dht22.ino`)*.

---

## 📂 Repository Structure

```
iot-platform/
├── docker-compose.yml             # Single-command orchestration for entire stack
├── go.mod / go.sum                # Go root module definition
├── README.md                      # Comprehensive project guide & documentation
│
├── backend/                       # Go REST API & Ingestion Service
│   ├── handlers/                  # Route handlers, SSE broker, OTA, alerts, export
│   │   ├── export.go              # CSV & JSON streaming data export
│   │   ├── ota.go                 # Firmware binary server & OTA dispatch
│   │   ├── notifications.go       # Slack, Discord & Webhook alert dispatcher
│   │   ├── sse.go                 # Zero-latency Server-Sent Events broker
│   │   ├── handlers.go            # Device CRUD, channel linking, downsampling & commands
│   │   └── handlers_test.go       # Unit tests covering all features
│   ├── models/                    # Data transfer objects & models
│   ├── mqtt/                      # Paho MQTT subscriber & command publisher
│   ├── Dockerfile                 # Multi-stage production container
│   └── main.go                    # Server entry point & auto-reconnect loop
│
├── frontend/                      # React 18 + Vite Management Dashboard
│   ├── src/
│   │   ├── components/            # UI components
│   │   │   ├── AddDeviceModal.jsx     # Dual-tab modal: select existing or register new
│   │   │   ├── ChannelsView.jsx       # Groups & channels with linked device badges & unlinking
│   │   │   ├── DevicesView.jsx        # Device inventory with channel/group tags
│   │   │   ├── DeviceSelector.jsx     # Live dashboard device selector with channel labels
│   │   │   ├── DeviceControlPanel.jsx # Two-way relay control, LED, reboot & OTA
│   │   │   ├── TelemetryChart.jsx     # Dual Y-axis charts with 1m/5m/1h rollups & export
│   │   │   ├── GuardrailsModal.jsx    # Threshold safety rules & Alert Channels
│   │   │   ├── UserDashboard.jsx      # Operator cockpit with live SSE push & onboarding
│   │   │   └── AdminDashboard.jsx     # Supervisory monitoring & user management
│   │   ├── api.js                 # Unified API client with device update endpoints
│   │   └── App.jsx                # Core application routing
│   ├── nginx.conf                 # Production Nginx reverse proxy with SSE buffering off
│   └── Dockerfile                 # Multi-stage production Nginx container
│
├── firmware/                      # Edge Microcontroller Firmware
│   ├── esp32-dht22/               # PlatformIO C++ firmware project
│   ├── arduino-ide/               # Standalone Arduino sketches
│   └── tools/
│       └── simulate_nodes.go      # Multi-node simulated sensor CLI
│
├── infra/                         # Infrastructure Configurations
│   ├── init.sql                   # Hypertables, continuous rollups, triggers, foreign keys
│   └── mosquitto.conf             # Mosquitto broker configuration
│
└── docs/                          # Architecture & Wiring Documentation
    ├── database_schema.md         # TimescaleDB hypertable schema design
    └── esp32_dht22_wiring_guide.md# Hardware pinout & wiring schematics
```

---

## 📄 License

This project is licensed under the MIT License — see the repository for details.
