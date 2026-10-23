# 🌐 Industrial IoT Platform Mono-Repo

[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go)](https://golang.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat&logo=vite)](https://vitejs.dev)
[![TimescaleDB](https://img.shields.io/badge/TimescaleDB-PostgreSQL_16-FDB515?style=flat&logo=postgresql)](https://timescale.com)
[![MQTT](https://img.shields.io/badge/MQTT-Mosquitto_2.0-660066?style=flat&logo=eclipsemosquitto)](https://mosquitto.org)
[![ESP32](https://img.shields.io/badge/Firmware-ESP32_+_DHT22-E7352C?style=flat&logo=espressif)](https://espressif.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v3-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com)

A high-performance, multi-tenant IoT platform designed for high-throughput time-series telemetry ingestion, edge device management, cryptographic provisioning, and real-time visualization.

---

## 📑 Table of Contents

- [System Architecture](#system-architecture)
- [Complete Services Breakdown (Assignment Reference)](#-complete-services-breakdown-assignment-reference)
  - [Service 1: TimescaleDB & PostgreSQL 16 Time-Series Engine](#service-1-timescaledb--postgresql-16-time-series-engine)
  - [Service 2: Eclipse Mosquitto MQTT Message Broker](#service-2-eclipse-mosquitto-mqtt-message-broker)
  - [Service 3: Go Ingestion & REST API Backend Service](#service-3-go-ingestion--rest-api-backend-service)
  - [Service 4: React 18 + Vite Management Dashboard](#service-4-react-18--vite-management-dashboard)
  - [Service 5: ESP32 Edge Firmware & Hardware Interface](#service-5-esp32-edge-firmware--hardware-interface)
  - [Service 6: Multi-Node Telemetry Simulator](#service-6-multi-node-telemetry-simulator-testing-without-hardware)
  - [Assignment Execution Modes (Zero-Docker vs. Full-Stack)](#-assignment-execution-modes)
- [Roadmap & Completed Milestones](#roadmap--completed-milestones)
- [Repository Structure](#repository-structure)
- [Quick Start Guide](#quick-start-guide)
  - [1. Infrastructure (TimescaleDB & Mosquitto)](#1-infrastructure-timescaledb--mosquitto)
  - [2. Backend Service (Go)](#2-backend-service-go)
  - [3. Frontend Dashboard (React + Vite)](#3-frontend-dashboard-react--vite)
  - [4. Firmware & ESP32 Flashing](#4-firmware--esp32-flashing)
  - [5. Testing Without Hardware (Simulator)](#5-testing-without-hardware-simulator)
- [Key Features](#key-features)
  - [Multi-Tenant Workspace & Channel Hierarchy](#multi-tenant-workspace--channel-hierarchy)
  - [Cryptographic Key & Firmware Config Generator](#cryptographic-key--firmware-config-generator)
  - [Resilient Backend Dual-Mode Operation](#resilient-backend-dual-mode-operation)
  - [Real-Time 5-Second Telemetry Engine](#real-time-5-second-telemetry-engine)
  - [Adaptive Light & Dark Mode](#adaptive-light--dark-mode)
- [Documentation Index](#documentation-index)
- [License](#license)

---

## 🏛️ System Architecture

```
                                  +---------------------------------------+
                                  |   ESP32 Microcontroller Nodes         |
                                  |   (DHT22 Temp & Humidity Sensor)      |
                                  +---------------------------------------+
                                           |                      |
                    MQTT (QoS 1, every 5s) |                      | MQTT (QoS 1, every 5s)
                    LWT: "offline"         |                      | LWT: "offline"
                                           v                      v
                                  +---------------------------------------+
                                  |   Eclipse Mosquitto Broker (:1883)   |
                                  |   Topics: devices/<id>/telemetry      |
                                  +---------------------------------------+
                                                      |
                                                      | Paho MQTT Subscriber
                                                      v
                                  +---------------------------------------+
                                  |         Go Backend Server (:8080)     |
                                  |  - Dual Mode (TimescaleDB + In-Memory)|
                                  |  - Auto-Registration & Heartbeat      |
                                  |  - RESTful API & CORS Proxy           |
                                  +---------------------------------------+
                                           |                      |
            SQL Writes / Trigger Sync      |                      | HTTP JSON REST API
                                           v                      v
        +-------------------------------------+        +-------------------------------------+
        |     TimescaleDB (PostgreSQL 16)     |        |   React 18 + Vite Dashboard (:3000) |
        |  ├── telemetry (Hypertable)         |        |  ├── 5s Polling Engine with Ticker  |
        |  └── latest_telemetry (Cache O(1))  |        |  ├── Multi-Tenant Workspaces & Keys |
        +-------------------------------------+        |  └── Dual Y-Axis Chart.js Charts    |
                                                       +-------------------------------------+
```

---

## 🛠️ Complete Services Breakdown (Assignment Reference)

This repository provides an enterprise-grade, multi-tenant IoT telemetry platform consisting of **6 distinct services and edge components**. Below is the detailed breakdown of each service, their runtime ports, responsibilities, failure recovery mechanisms, and how to use them for your assignment.

---

### Service 1: TimescaleDB & PostgreSQL 16 Time-Series Engine
- **Directory**: [`infra/`](infra/)
- **Configuration**: [`infra/docker-compose.yml`](infra/docker-compose.yml) & [`infra/init.sql`](infra/init.sql)
- **Port**: `5433` (mapped from container port `5432`)
- **Credentials**: Database: `iot_platform` | User: `iot_user` | Password: `iot_secure_password`
- **Architecture & Capabilities**:
  1. **Multi-Tenancy Isolation (`tenants` table)**: Enforces organizational data boundaries using UUID primary keys. Seeded with default tenant `a0000000-0000-0000-0000-000000000001` (*Default Organization*).
  2. **Device Registry (`devices` table)**: Stores edge device metadata, device type, tenant association, and live connection status (`online` / `offline`).
  3. **Partitioned Hypertable (`telemetry` table)**: Powered by TimescaleDB, partitioning millions of incoming data points by timestamp `time`. Features a composite index on `(tenant_id, device_id, time DESC)` and a `GIN` index on JSONB payloads for low-latency JSON filtering.
  4. **$O(1)$ State Cache (`latest_telemetry` table)**: Keeps only the single latest telemetry snapshot per device.
  5. **Automated Trigger Sync (`trg_update_latest_telemetry`)**: A PostgreSQL trigger executes `AFTER INSERT ON telemetry` to instantly upsert `latest_telemetry`, ensuring dashboard state checks execute in constant $O(1)$ time without scanning millions of historical rows.

---

### Service 2: Eclipse Mosquitto MQTT Message Broker
- **Directory**: [`infra/`](infra/)
- **Configuration**: [`infra/mosquitto.conf`](infra/mosquitto.conf)
- **Ports**: `1883` (Native MQTT TCP) & `9001` (MQTT over WebSockets)
- **Architecture & Capabilities**:
  1. **High-Throughput Ingestion**: Serves as the central pub/sub messaging hub for sensor nodes.
  2. **Topic Routing**:
     - `devices/<device_id>/telemetry`: Telemetry stream for individual edge devices.
     - `devices/<device_id>/status`: Device presence and Last Will and Testament (LWT) topic.
     - `tenants/<tenant_id>/devices/<device_id>/telemetry`: Tenant-explicit routing.
  3. **Development Convenience**: Pre-configured with anonymous access enabled for rapid local testing without authentication barriers.

---

### Service 3: Go Ingestion & REST API Backend Service
- **Directory**: [`backend/`](backend/)
- **Entry Point**: [`backend/main.go`](backend/main.go)
- **Port**: `8080`
- **Architecture & Capabilities**:
  1. **Eclipse Paho MQTT Subscriber**:
     - Connects directly to the Mosquitto broker on `tcp://localhost:1883`.
     - Automatically discovers and subscribes with QoS 1 to `devices/+/telemetry`, `tenants/+/devices/+/telemetry`, and `iot/telemetry`.
     - **Auto-Registration**: Automatically detects new devices streaming data and registers them in the database or memory cache on the fly.
  2. **Resilient Dual-Mode Operation (Graceful Degradation)**:
     - **Database Mode**: When TimescaleDB is online, queries and writes flow directly to PostgreSQL with SQL triggers.
     - **In-Memory Fallback Mode**: If Docker or TimescaleDB is stopped or offline, the server **never fails or crashes**. It switches transparently to a thread-safe, mutex-protected in-memory cache (`sync.RWMutex`), continuing to answer all REST calls and accept telemetry.
     - **Background Auto-Reconnect**: A background goroutine checks TimescaleDB every 5 seconds and reconnects automatically without restarting the backend process.
  3. **RESTful API Engine**:
     - `GET /health`: Health status and database connectivity indicator.
     - `GET /api/v1/devices`: Lists registered edge devices with optional `tenant_id` and `status` query filters.
     - `GET /api/v1/devices/{id}/telemetry/latest`: Fetches the latest sensor snapshot.
     - `GET /api/v1/devices/{id}/telemetry/history`: Retrieves time-series records supporting `limit`, `order=ASC|DESC`, and timestamp range filters (`start`, `end`).
     - `POST /api/v1/devices/{id}/telemetry`: Direct HTTP telemetry ingestion endpoint.
     - `DELETE /api/v1/devices/{id}`: Deletes a device and purges all its telemetry data.
     - `POST /api/v1/devices/reset`: Purges all test devices and telemetry across the active workspace.
     - **CORS Support**: Permissive headers enabling cross-origin requests from any frontend port.

---

### Service 4: React 18 + Vite Management Dashboard
- **Directory**: [`frontend/`](frontend/)
- **Entry Point**: [`frontend/src/App.jsx`](frontend/src/App.jsx)
- **Port**: `3000` (`http://localhost:3000`)
- **Architecture & Capabilities**:
  1. **5-Second Polling Engine**: Built-in countdown timer (`5s` → `0s`) with automatic data re-fetching, live pause/resume toggle, and manual refresh button.
  2. **Dual Y-Axis Time-Series Chart**: Powered by Chart.js, rendering temperature on the left Y-axis (toggleable between °C and °F) and relative humidity (% RH) on the right Y-axis, including a multi-device comparison mode.
  3. **Workspace & Channel Management**:
     - **Workspaces/Tenants**: Create, switch, and isolate tenant organizations.
     - **Channels/Groups**: Organize devices into functional groups (e.g., Server Room, Lab).
     - **Edge Client Registry**: View device health, last seen time, WiFi RSSI, delete devices, or purge test data.
  4. **Cryptographic Key & Firmware Provisioning Generator**: Dynamically generates RFC 4122 UUIDs, channel IDs, secret tokens (`iot_sec_...`), and produces a copy-paste ready C++ `config.h` header for ESP32 flashing.
  5. **In-Browser Test Packet Injection**: "Send Test Packet" button enables instant end-to-end data generation without terminal commands or physical hardware.
  6. **Adaptive Theme Engine**: Seamless Light Mode and Dark Mode switching, stored in browser `localStorage`.

---

### Service 5: ESP32 Edge Firmware & Hardware Interface
- **Directory**: [`firmware/esp32-dht22/`](firmware/esp32-dht22/) (PlatformIO) & [`firmware/arduino-ide/`](firmware/arduino-ide/) (Arduino IDE)
- **Architecture & Capabilities**:
  1. **Non-Blocking Sampling Loop**: Samples the DHT22 sensor every 5 seconds without blocking CPU operations (`millis()` timers).
  2. **Dual Exponential Reconnect Backoff**: Implements exponential backoff (1s doubling up to 60s max) independently for WiFi disconnects and MQTT broker outages.
  3. **Last Will and Testament (LWT)**: Registers an automatic LWT message (`devices/<device_id>/status` with payload `"offline"` and retain=true). If power is cut, the broker notifies subscribers instantly.
  4. **Dual Transport Fallback**: If the MQTT broker is down but WiFi is reachable, the firmware automatically falls back to direct HTTP POST to `http://<broker_ip>:8080/api/v1/devices/<device_id>/telemetry`.
  5. **Physical Hardware Support**: Complete wiring diagrams for both 3-pin breakout modules and 4-pin bare DHT22 sensors ([Hardware Wiring Guide](docs/esp32_dht22_wiring_guide.md)).

---

### Service 6: Multi-Node Telemetry Simulator (Testing Without Hardware)
- **Directory**: [`firmware/tools/`](firmware/tools/)
- **File**: [`firmware/tools/simulate_nodes.go`](firmware/tools/simulate_nodes.go)
- **Architecture & Capabilities**:
  1. Simulates 1, 2, or more virtual ESP32 nodes (`esp32-dht22-01`, `esp32-dht22-02`).
  2. Streams realistic temperature (23.5°C–26.2°C) and humidity (52%–58%) with slight random fluctuations, sequence numbers, device uptime, and WiFi RSSI.
  3. Publishes directly to Mosquitto every 5 seconds, providing an authentic hardware testing experience without needing physical microcontrollers.

---

### 🚀 Assignment Execution Modes

This platform is specifically designed to accommodate two execution workflows depending on whether Docker is available:

| Feature / Mode | Mode A: Zero-Docker Lightweight Mode | Mode B: Full-Stack Containerized Mode |
| :--- | :--- | :--- |
| **Prerequisites** | Go 1.22+ and Node.js 18+ only | Docker Desktop, Go 1.22+, Node.js 18+ |
| **Database** | In-Memory Mutex-Protected Fallback Cache | TimescaleDB (PostgreSQL 16) with Hypertables |
| **Broker** | Optional (Use HTTP Ingest / UI Button) | Eclipse Mosquitto MQTT Broker (:1883) |
| **How to Start** | 1. `cd backend && go run main.go`<br>2. `cd frontend && npm run dev` | 1. `cd infra && docker compose up -d`<br>2. `cd backend && go run main.go`<br>3. `cd frontend && npm run dev` |
| **Telemetry Ingestion** | Click **"Send Test Packet"** in dashboard or use HTTP POST | Physical ESP32, Go CLI Simulator, or UI button |
| **Ideal For** | Quick evaluation, grading, and presentation | Production demonstration and edge device connection |

---

## 🚀 Roadmap & Completed Milestones

| Stage | Focus Area | Status | Key Deliverables |
| :--- | :--- | :---: | :--- |
| **Days 1–2** | **Core Infrastructure & Ingestion Pipeline** | ✅ Complete | • Docker Compose for TimescaleDB & Mosquitto<br>• Relational schema with hypertable partitioning (`telemetry`) and $O(1)$ state cache (`latest_telemetry`)<br>• Go backend with Paho MQTT subscriber, device auto-registration, and REST APIs (`/health`, `/devices`, `/telemetry/latest`, `/telemetry/history`) |
| **Days 3–4** | **ESP32 + DHT22 Firmware & Edge Hardware** | ✅ Complete | • Non-blocking PlatformIO C++ firmware with dual exponential reconnect backoff (1s → 60s)<br>• Arduino IDE standalone sketch (`.ino`)<br>• Last Will and Testament (LWT) for instant offline detection<br>• Comprehensive hardware wiring schematics for 3-pin and 4-pin DHT22 sensors<br>• Multi-node Go CLI simulator for instant validation without physical hardware |
| **Days 5–6** | **Frontend Dashboard & Management Portal** | ✅ Complete | • React 18 + Vite + Tailwind CSS dashboard with light & dark theme persistence<br>• 5-second polling engine with live countdown ticker, pause/resume, and manual refresh<br>• Left sidebar navigation cards: Workspaces/Tenants, Channels/Groups, Devices, and Key Generator<br>• Built-in Cryptographic Key Generator (Tenant UUID, Channel Slug, Secret Key, and one-click copyable `config.h`)<br>• Dynamic workspace device lifecycle: no fake mock devices, clean onboarding state, and single-click device deletion / workspace purge<br>• Dual Y-axis Chart.js line charts for Temperature (°C/°F) and Humidity (% RH) with recent ingestion table |

---

## 📂 Repository Structure

```
iot-platform/
├── backend/                       # High-throughput Go backend service
│   ├── handlers/                  # REST API handlers, in-memory fallback cache, DB queries
│   ├── models/                    # Data transfer objects (DTOs) & database models
│   ├── mqtt/                      # Eclipse Paho MQTT subscriber & ingestion consumer
│   ├── go.mod                     # Go dependencies
│   ├── main.go                    # Service entry point & background reconnection loop
│   └── README.md                  # Backend API documentation & architecture
│
├── frontend/                      # Enterprise React web dashboard & management UI
│   ├── src/
│   │   ├── components/            # UI modular components
│   │   │   ├── Sidebar.jsx        # Left navigation cards (Workspaces, Channels, Devices, Keys)
│   │   │   ├── Header.jsx         # System health, countdown timer, unit & theme toggles
│   │   │   ├── DeviceSelector.jsx # Device switcher & empty workspace onboarding
│   │   │   ├── MetricCard.jsx     # Temperature, Humidity, and RSSI health cards
│   │   │   ├── TelemetryChart.jsx # Chart.js dual Y-axis historical trend lines
│   │   │   ├── RecentTable.jsx    # Live tabular packet viewer
│   │   │   ├── TenantsView.jsx    # Multi-tenant workspace management
│   │   │   ├── ChannelsView.jsx   # Logical telemetry channels & MQTT topic routing
│   │   │   ├── DevicesView.jsx    # Edge client registry with trash / clear actions
│   │   │   ├── ProvisioningView.jsx # Cryptographic key generator & config builder
│   │   │   ├── ProvisionModal.jsx # Quick device onboarding modal
│   │   │   ├── AddTenantModal.jsx # Add workspace dialog
│   │   │   └── AddChannelModal.jsx# Add channel dialog
│   │   ├── api.js                 # API client wrapper with proxy support
│   │   ├── App.jsx                # Core application state & polling engine
│   │   └── main.jsx               # React DOM entry point
│   ├── package.json               # Node.js dependencies
│   ├── vite.config.js             # Vite configuration with /api backend proxy
│   └── README.md                  # Frontend feature walkthrough & setup guide
│
├── firmware/                      # Edge microcontroller firmware & tools
│   ├── esp32-dht22/               # Production PlatformIO firmware project
│   │   ├── include/config.h       # Hardware pinouts, WiFi, and MQTT credentials
│   │   ├── src/main.cpp           # Non-blocking publish loop & exponential backoff
│   │   └── platformio.ini         # PlatformIO build configuration
│   ├── arduino-ide/               # Standalone Arduino IDE sketches
│   │   └── esp32_dht22/           # esp32_dht22.ino + config.h
│   ├── tools/
│   │   └── simulate_nodes.go      # Multi-node MQTT telemetry simulator (Go)
│   └── README.md                  # Firmware guide & flashing instructions
│
├── infra/                         # Production infrastructure & container definitions
│   ├── docker-compose.yml         # Compose stack for TimescaleDB & Mosquitto
│   ├── init.sql                   # Database migrations, hypertables, and triggers
│   ├── mosquitto.conf             # Mosquitto broker configuration
│   ├── .env.example               # Environment variable templates
│   └── README.md                  # Infrastructure deployment & configuration
│
└── docs/                          # Engineering specifications & guides
    ├── database_schema.md         # TimescaleDB hypertable schema design
    ├── esp32_dht22_wiring_guide.md# Hardware pinout & wiring diagrams
    └── README.md                  # Architecture index & document references
```

---

## ⚡ Quick Start Guide

### 1. Infrastructure (TimescaleDB & Mosquitto)

Ensure [Docker](https://www.docker.com/) is installed and running:
```bash
cd infra
cp .env.example .env
docker compose up -d
```
Verify running services:
- **TimescaleDB**: `localhost:5433` (DB: `iot_platform`, User: `postgres`)
- **Mosquitto MQTT**: `localhost:1883`

---

### 2. Backend Service (Go)

The Go backend features **automatic fallback**: if TimescaleDB or Docker is temporarily offline, the backend continues running in resilient in-memory mode, auto-reconnecting as soon as the database starts!

```bash
cd backend
go run main.go
```
The server will start on port `8080`.
Verify backend status in your terminal:
```bash
curl http://localhost:8080/health
```

---

### 3. Frontend Dashboard (React + Vite)

In a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:3000`** in your browser.
- Switch between **Light Mode** and **Dark Mode** via the Sun/Moon icon in the header.
- View real-time 5-second countdown polling.
- Explore Workspaces, Channels, and the Key Generator in the left sidebar cards.

---

### 4. Firmware & ESP32 Flashing

1. Review the [Hardware Wiring Guide](docs/esp32_dht22_wiring_guide.md) to connect your DHT22 sensor to the ESP32:
   - **VCC** → 3.3V
   - **GND** → GND
   - **DATA** → GPIO 4 (with 10kΩ pull-up resistor if using 4-pin DHT22)
2. Generate credentials in the frontend dashboard:
   - Go to **Key Generator** in the sidebar.
   - Click **Generate Credentials** and copy the generated C++ config snippet.
   - Paste it into `firmware/esp32-dht22/include/config.h` (or set your WiFi SSID and PC broker IP).
3. Build and flash using PlatformIO:
   ```bash
   cd firmware/esp32-dht22
   pio run --target upload
   pio device monitor -b 115200
   ```
*(Arduino IDE users can open `firmware/arduino-ide/esp32_dht22/esp32_dht22.ino`)*

---

### 5. Testing Without Hardware (Simulator)

If you do not have an ESP32 board on hand, you can simulate 1–2 nodes streaming realistic DHT22 telemetry:
```bash
go run firmware/tools/simulate_nodes.go -broker tcp://localhost:1883 -nodes 2
```
Or simply click the **"Send Test Packet"** button directly on the frontend dashboard!

---

## 🌟 Key Features

### Multi-Tenant Workspace & Channel Hierarchy
- **Workspaces / Tenants**: Full organizational isolation. Devices, channels, and metrics belong to their respective tenant UUIDs.
- **Groups & Channels**: Logical categorizations (e.g. *Laboratory Environmental Monitoring*, *Server Room HVAC*) mapped to MQTT topic patterns (`devices/+/telemetry`).
- **Clean Empty States**: No dummy devices are hardcoded. Fresh workspaces show an inviting empty state ready for provisioning.
- **Device Management**: Clear individual test devices or purge all devices in a workspace with a single click.

### Cryptographic Key & Firmware Config Generator
- Generates RFC 4122 Tenant UUIDs, Channel Slugs, and `iot_sec_...` cryptographic authentication keys.
- Features a **one-click copyable C++ `config.h` snippet** containing WiFi SSID, MQTT IP, Tenant ID, Channel ID, and Secret Key ready to paste directly into your firmware.

### Resilient Backend Dual-Mode Operation
- When TimescaleDB is connected: Telemetry is partitioned across hypertables with trigger-driven $O(1)$ latest telemetry caching.
- If TimescaleDB is offline: An internal thread-safe in-memory cache handles all ingestion, latest readings, and history queries with HTTP 200 responses, automatically retrying the PostgreSQL connection in the background.

### Real-Time 5-Second Telemetry Engine
- The frontend features a synchronized **5-second polling ticker** (`5s` → `1s`) with pause/resume controls and manual refresh.
- Displays live metric cards with temperature unit toggling (°C / °F), dynamic trend deltas, min/max metrics, and ESP32 WiFi RSSI signal strength.
- Chart.js powered historical line charts render smooth curves over dual Y-axes with real-time rolling window subqueries and sample size filters (10, 20, 50, 100 points), advancing forward dynamically with current wall-clock time.
- Dynamic multi-tenant workspace auto-detection and persistence ensuring active edge devices are immediately visible upon browser load.

### Adaptive Light & Dark Mode
- Built with Tailwind CSS supporting both an ultra-clean **Light Mode** and modern **Dark Mode**.
- Persists user preferences seamlessly in browser `localStorage`.

---

## 📚 Documentation Index

- [Backend API Specification & Architecture](backend/README.md)
- [Frontend Dashboard & Component Guide](frontend/README.md)
- [Firmware Setup, PlatformIO & Arduino Guide](firmware/README.md)
- [Hardware Wiring & Assembly Guide](docs/esp32_dht22_wiring_guide.md)
- [Database Schema & TimescaleDB Hypertable Design](docs/database_schema.md)
- [Infrastructure & Docker Compose Guide](infra/README.md)

---

## 📄 License

This project is licensed under the MIT License — see the repository for details.
