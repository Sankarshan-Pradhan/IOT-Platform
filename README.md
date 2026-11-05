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

If you are new to this project or setting it up on a fresh machine, you can run the **entire platform** (Database, MQTT Broker, Backend API, and Frontend Dashboard) with a single command:

### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.
- [Git](https://git-scm.com/) (optional, to clone).

### 2. Launch Stack
```bash
git clone <repository-url>
cd iot-platform
docker compose up --build
```
*(Or use `docker compose up -d` to run in the background).*

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

## 📑 Table of Contents

- [Quick Start for New Users](#-quick-start-for-new-users-1-command-boot)
- [System Architecture](#-system-architecture)
- [7 Enterprise Production Features](#-7-enterprise-production-features)
  - [1. Downlink Device Control & Actuation](#1-downlink-device-control--actuation-two-way-communication)
  - [2. Zero-Latency Real-Time Streaming (SSE)](#2-zero-latency-real-time-streaming-server-sent-events)
  - [3. Outbound Alert Notification Channels](#3-outbound-alert-notification-channels)
  - [4. TimescaleDB Continuous Aggregates & Downsampling](#4-timescaledb-continuous-aggregates--downsampling)
  - [5. Historical Data Export & Reporting (CSV & JSON)](#5-historical-data-export--reporting-csv--json)
  - [6. Device Provisioning & Over-the-Air (OTA) Updates](#6-device-provisioning--over-the-air-ota-updates)
  - [7. End-to-End Multi-Stage Containerization](#7-end-to-end-multi-stage-containerization)
- [Services Breakdown](#-services-breakdown)
- [Local Development Setup (Without Docker)](#-local-development-setup-without-docker)
- [Firmware Flashing Guide (Physical ESP32)](#-firmware-flashing-guide-physical-esp32)
- [Repository Structure](#-repository-structure)
- [Documentation Index](#-documentation-index)
- [License](#-license)

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
        |  ├── telemetry (Hypertable)         |        |  ├── Live 0ms SSE Telemetry Stream  |
        |  ├── telemetry_1m/5m/1h (Rollups)   |        |  ├── Device Control Panel (Relays)  |
        |  ├── device_commands & channels     |        |  ├── Rollup Downsampling (1m/5m/1h) |
        |  └── 30-Day Chunk Retention Policy  |        |  └── CSV/JSON Data Export Trigger   |
        +-------------------------------------+        +-------------------------------------+
```

---

## 🚀 7 Enterprise Production Features

### 1. Downlink Device Control & Actuation (Two-Way Communication)
Telemetry flows upstream, but operators can also dispatch instant hardware commands downstream:
* **MQTT Topics:** Subscribes to `devices/{id}/commands` and ingests acknowledgments on `devices/{id}/command_ack`.
* **REST Endpoints:** `POST /api/v1/devices/{id}/commands` and `GET /api/v1/devices/{id}/commands`.
* **Supported Hardware Actions:**
  * `set_relay`: Energizes or de-energizes external AC/DC relays (`state: true | false`).
  * `toggle_led`: Controls onboard status beacon LED.
  * `set_interval`: Dynamically updates sensor sampling rate (1s to 60s).
  * `reboot`: Dispatches acknowledgment and triggers hardware restart via `ESP.restart()`.
* **UI:** Interactive cards, sampling rate pills, reboot confirmation modal, and real-time command dispatch log in [`DeviceControlPanel.jsx`](frontend/src/components/DeviceControlPanel.jsx).

---

### 2. Zero-Latency Real-Time Streaming (Server-Sent Events)
Replaces or complements standard 5-second polling with instant push notifications:
* **SSE Broker:** [`backend/handlers/sse.go`](backend/handlers/sse.go) provides zero-latency event streaming via `GET /api/v1/telemetry/stream`.
* **Zero Overhead:** Native Go `http.Flusher` implementation with automatic 15-second keep-alive heartbeats and firewall-friendly HTTP/1.1 transport.
* **Events Broadcasted:** `telemetry` (instant ingestion), `alarm` (guardrail violation/resolution), and `command_ack` (device action confirmation).
* **UI Integration:** Animated `Live SSE (0ms)` pulse indicator in header; automatic fallback to polling if connection drops.

---

### 3. Outbound Alert Notification Channels
When guardrail safety rules detect critical threshold violations, operators are instantly notified externally:
* **Supported Channels:** **Discord** Webhooks, **Slack** Incoming Webhooks, and generic **HTTP POST Webhooks**.
* **Automatic Dispatch:** `evaluateRules()` dispatches async alerts when `CRITICAL` alarms fire.
* **UI Channel Manager:** Dedicated **Alert Channels** tab in [`GuardrailsModal.jsx`](frontend/src/components/GuardrailsModal.jsx) with webhook registration and live "Test Ping" button.

---

### 4. TimescaleDB Continuous Aggregates & Downsampling
Optimized for long-range analytics across millions of time-series data points:
* **Continuous Aggregate Views:** Defined in [`infra/init.sql`](infra/init.sql):
  * `telemetry_1m`: 1-minute bucket rollups (`avg`, `min`, `max`, `count`).
  * `telemetry_5m`: 5-minute bucket rollups.
  * `telemetry_1h`: 1-hour bucket rollups.
* **Automated Refresh Policies:** Scheduled via `add_continuous_aggregate_policy()`.
* **Data Retention Policy:** Automatically purges raw hypertable chunks older than 30 days (`add_retention_policy('telemetry', INTERVAL '30 days')`).
* **UI Downsampling:** Dynamic resolution pills (`Raw`, `1m`, `5m`, `1h`) in [`TelemetryChart.jsx`](frontend/src/components/TelemetryChart.jsx).

---

### 5. Historical Data Export & Reporting (CSV & JSON)
Allows engineers and auditors to extract time-series datasets directly from the UI:
* **Backend Streaming Engine:** [`backend/handlers/export.go`](backend/handlers/export.go) on `GET /api/v1/devices/{id}/telemetry/export?format=csv|json`.
* **Formatted CSV Streams:** Includes ISO-8601 timestamps, tenant ID, device ID, temperature, humidity, WiFi RSSI, and raw payload.
* **Direct UI Downloads:** Dedicated **CSV** and **JSON** export buttons in the telemetry chart toolbar.

---

### 6. Device Provisioning & Over-the-Air (OTA) Updates
Secures edge devices and enables remote firmware updates over Wi-Fi:
* **Per-Device Auth Tokens:** Stored in `devices` table with secure token generation (`tok_{deviceID}_{hex}`) and rotation endpoint `POST /api/v1/devices/{id}/token`.
* **Firmware Distribution:** [`backend/handlers/ota.go`](backend/handlers/ota.go):
  * `POST /api/v1/ota/firmware`: Multi-part `.bin` firmware file upload with SHA-256 verification.
  * `GET /api/v1/ota/firmware/{filename}`: Raw binary streaming for ESP32 `HTTPUpdate`.
  * `POST /api/v1/devices/{id}/ota`: Dispatches remote downlink flashing command.
* **UI Controls:** Token copy, token rotation, and OTA firmware modal inside [`DeviceControlPanel.jsx`](frontend/src/components/DeviceControlPanel.jsx).

---

### 7. End-to-End Multi-Stage Containerization
Production-ready container setup for seamless deployment:
* **Backend Container:** Multi-stage build (`golang:1.24-alpine` -> `alpine:3.20`) with healthchecks in [`backend/Dockerfile`](backend/Dockerfile).
* **Frontend Container:** Multi-stage build (`node:20-alpine` -> `nginx:alpine`) with reverse proxy and SSE buffering rules in [`frontend/Dockerfile`](frontend/Dockerfile) and [`frontend/nginx.conf`](frontend/nginx.conf).
* **Root Compose:** [`docker-compose.yml`](docker-compose.yml) orchestrating all 4 services with a single command.

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

If you prefer to edit code natively without Docker:

### 1. Requirements
* [Go 1.24+](https://go.dev/)
* [Node.js 20+](https://nodejs.org/)

### 2. Start Backend Service
```bash
cd backend
go run main.go
```
*Note: The backend automatically falls back to in-memory mode if a local TimescaleDB instance is not detected, so it runs immediately with zero configuration!*

### 3. Start Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
Open [`http://localhost:3000`](http://localhost:3000) in your browser.

---

## 🔌 Firmware Flashing Guide (Physical ESP32)

1. Review the [Hardware Wiring Guide](docs/esp32_dht22_wiring_guide.md) to wire the DHT22 and relay module:
   * **DHT22 DATA** → GPIO 4
   * **Relay IN** → GPIO 26
   * **Status LED** → GPIO 2
2. Edit WiFi credentials and backend IP in `firmware/esp32-dht22/include/config.h`.
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
│
├── backend/                       # Go REST API & Ingestion Service
│   ├── handlers/                  # Route handlers, SSE broker, OTA, alerts, export
│   │   ├── export.go              # CSV & JSON streaming data export
│   │   ├── ota.go                 # Firmware binary server & OTA dispatch
│   │   ├── notifications.go       # Slack, Discord & Webhook alert dispatcher
│   │   ├── sse.go                 # Zero-latency Server-Sent Events broker
│   │   ├── handlers.go            # CRUD, downsampling & device commands
│   │   └── handlers_test.go       # 14 unit tests covering all features
│   ├── models/                    # Data transfer objects & models
│   ├── mqtt/                      # Paho MQTT subscriber & command publisher
│   ├── Dockerfile                 # Multi-stage production container
│   ├── main.go                    # Server entry point & auto-reconnect loop
│   └── README.md                  # Backend API documentation
│
├── frontend/                      # React 18 + Vite Management Dashboard
│   ├── src/
│   │   ├── components/            # UI components
│   │   │   ├── DeviceControlPanel.jsx # Two-way relay control, LED, reboot & OTA
│   │   │   ├── TelemetryChart.jsx     # Dual Y-axis charts with 1m/5m/1h rollups & export
│   │   │   ├── GuardrailsModal.jsx    # Threshold safety rules & Alert Channels
│   │   │   ├── UserDashboard.jsx      # Operator cockpit with live SSE push
│   │   │   ├── AdminDashboard.jsx     # Supervisory monitoring & user management
│   │   │   ├── AuthScreen.jsx         # Full-page login & registration gate
│   │   │   └── ...
│   │   ├── api.js                 # Unified API client
│   │   └── App.jsx                # Core application routing
│   ├── nginx.conf                 # Production Nginx reverse proxy with SSE buffering off
│   ├── Dockerfile                 # Multi-stage production Nginx container
│   └── README.md                  # Frontend feature walkthrough
│
├── firmware/                      # Edge Microcontroller Firmware
│   ├── esp32-dht22/               # PlatformIO C++ firmware project
│   │   └── src/main.cpp           # Non-blocking loop, downlink commands, OTA
│   ├── arduino-ide/               # Standalone Arduino sketches
│   ├── tools/
│   │   └── simulate_nodes.go      # Multi-node simulated sensor CLI
│   └── README.md                  # Firmware guide & flashing steps
│
├── infra/                         # Infrastructure Configurations
│   ├── docker-compose.yml         # Compose stack
│   ├── init.sql                   # Hypertables, continuous rollups, triggers
│   ├── mosquitto.conf             # Mosquitto broker configuration
│   └── README.md                  # Database & broker documentation
│
└── docs/                          # Architecture & Wiring Documentation
    ├── database_schema.md         # TimescaleDB hypertable schema design
    ├── esp32_dht22_wiring_guide.md# Hardware pinout & wiring schematics
    └── README.md                  # Documentation index
```

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
