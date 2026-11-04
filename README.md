# 🌐 Industrial IoT Platform Mono-Repo

[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go)](https://golang.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat&logo=vite)](https://vitejs.dev)
[![TimescaleDB](https://img.shields.io/badge/TimescaleDB-PostgreSQL_16-FDB515?style=flat&logo=postgresql)](https://timescale.com)
[![MQTT](https://img.shields.io/badge/MQTT-Mosquitto_2.0-660066?style=flat&logo=eclipsemosquitto)](https://mosquitto.org)
[![ESP32](https://img.shields.io/badge/Firmware-ESP32_+_DHT22-E7352C?style=flat&logo=espressif)](https://espressif.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v3-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com)

A high-performance, multi-tenant IoT platform designed for high-throughput time-series telemetry ingestion, edge device management, full CRUD/deletion lifecycle, and real-time visualization.

---

## 📑 Table of Contents

- [System Architecture](#system-architecture)
- [Complete Services Breakdown](#-complete-services-breakdown)
  - [Service 1: TimescaleDB & PostgreSQL 16 Time-Series Engine](#service-1-timescaledb--postgresql-16-time-series-engine)
  - [Service 2: Eclipse Mosquitto MQTT Message Broker](#service-2-eclipse-mosquitto-mqtt-message-broker)
  - [Service 3: Go Ingestion & REST API Backend Service](#service-3-go-ingestion--rest-api-backend-service)
  - [Service 4: React 18 + Vite Management Dashboard](#service-4-react-18--vite-management-dashboard)
  - [Service 5: ESP32 Edge Firmware & Hardware Interface](#service-5-esp32-edge-firmware--hardware-interface)
  - [Service 6: Multi-Node Telemetry Simulator](#service-6-multi-node-telemetry-simulator-testing-without-hardware)
  - [Platform Execution Modes (Zero-Docker vs. Full-Stack)](#-platform-execution-modes)
- [Roadmap & Completed Milestones](#roadmap--completed-milestones)
- [Repository Structure](#repository-structure)
- [Quick Start Guide](#quick-start-guide)
  - [1. Infrastructure (TimescaleDB & Mosquitto)](#1-infrastructure-timescaledb--mosquitto)
  - [2. Backend Service (Go)](#2-backend-service-go)
  - [3. Frontend Dashboard (React + Vite)](#3-frontend-dashboard-react--vite)
  - [4. Firmware & ESP32 Flashing](#4-firmware--esp32-flashing)
  - [5. Testing Without Hardware (Simulator)](#5-testing-without-hardware-simulator)
- [Key Features](#key-features)
  - [Full-Page Login & User Registration Gate](#full-page-login--user-registration-gate)
  - [User-Scoped Workspaces & Superuser Admin Directory](#user-scoped-workspaces--superuser-admin-directory)
  - [Top-Down Navigation Hierarchy](#top-down-navigation-hierarchy)
  - [Guardrail Features (Dynamic Rules & Alarms)](#guardrail-features-dynamic-rules--alarms)
  - [JWT Authentication & Role-Based Access Control](#jwt-authentication--role-based-access-control)
  - [Full Deletion Lifecycle & Cascading Cleanup](#full-deletion-lifecycle--cascading-cleanup)
  - [First-Time User Onboarding & Clean Zero-Mock States](#first-time-user-onboarding--clean-zero-mock-states)
  - [Resilient Backend Dual-Mode Operation](#resilient-backend-dual-mode-operation)
  - [Real-Time 5-Second Telemetry Engine](#real-time-5-second-telemetry-engine)
  - [Unit Testing & Automated CI Pipeline](#unit-testing--automated-ci-pipeline)
  - [Clean Enterprise Light Theme](#clean-enterprise-light-theme)
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
                                  |  - API Key Protected Management APIs  |
                                  |  - Full REST CRUD for Tenants/Channels|
                                  +---------------------------------------+
                                           |                      |
            SQL Writes / Trigger Sync      |                      | HTTP JSON REST API
                                           v                      v
        +-------------------------------------+        +-------------------------------------+
        |     TimescaleDB (PostgreSQL 16)     |        |   React 18 + Vite Dashboard (:3000) |
        |  ├── tenants, channels, devices     |        |  ├── 1. Workspaces & Tenancy (Top)  |
        |  ├── telemetry (Hypertable)         |        |  ├── 2. Live Dashboard (5s Ticker)  |
        |  └── latest_telemetry (Cache O(1))  |        |  ├── 3. Clients & Edge Devices      |
        +-------------------------------------+        |  └── 4. Groups & Telemetry Channels |
                                                       +-------------------------------------+
```

---

## 🛠️ Complete Services Breakdown

This repository provides an enterprise-grade, multi-tenant IoT telemetry platform consisting of **6 distinct services and edge components**.

---

### Service 1: TimescaleDB & PostgreSQL 16 Time-Series Engine
- **Directory**: [`infra/`](infra/)
- **Configuration**: [`infra/docker-compose.yml`](infra/docker-compose.yml) & [`infra/init.sql`](infra/init.sql)
- **Port**: `5433` (mapped from container port `5432`)
- **Credentials**: Database: `iot_platform` | User: `iot_user` | Password: `iot_secure_password`
- **Architecture & Capabilities**:
  1. **Multi-Tenancy Isolation (`tenants` table)**: Enforces organizational data boundaries using UUID primary keys. Seeded with default tenant `a0000000-0000-0000-0000-000000000001` (*Default Organization*).
  2. **Channel Hierarchy (`channels` table)**: Maps devices to logical telemetry channels and stream routing topics.
  3. **Device Registry (`devices` table)**: Stores edge device metadata, device type, tenant association, channel association, and live connection status (`online` / `offline`).
  4. **Partitioned Hypertable (`telemetry` table)**: Powered by TimescaleDB, partitioning incoming data points by timestamp `time`. Features a composite index on `(tenant_id, device_id, time DESC)` and a `GIN` index on JSONB payloads for low-latency queries.
  5. **$O(1)$ State Cache (`latest_telemetry` table)**: Keeps only the single latest telemetry snapshot per device.
  6. **Automated Trigger Sync (`trg_update_latest_telemetry`)**: A PostgreSQL trigger executes `AFTER INSERT ON telemetry` to instantly upsert `latest_telemetry`, ensuring dashboard state checks execute in constant $O(1)$ time.

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
     - `channels/<channel_id>/telemetry`: Channel-explicit routing.
  3. **Development Convenience**: Pre-configured with anonymous access enabled for rapid local testing.

---

### Service 3: Go Ingestion & REST API Backend Service
- **Directory**: [`backend/`](backend/)
- **Entry Point**: [`backend/main.go`](backend/main.go)
- **Port**: `8080`
- **Architecture & Capabilities**:
  1. **Eclipse Paho MQTT Subscriber**:
     - Connects directly to the Mosquitto broker on `tcp://localhost:1883`.
     - Automatically subscribes with QoS 1 to `devices/+/telemetry`, `channels/+/telemetry`, and `iot/telemetry`.
     - **Auto-Registration**: Automatically detects new devices streaming data and registers them in the database or memory cache.
  2. **Resilient Dual-Mode Operation (Graceful Degradation)**:
     - **Database Mode**: When TimescaleDB is online, queries and writes flow directly to PostgreSQL with SQL triggers.
     - **In-Memory Fallback Mode**: If Docker or TimescaleDB is stopped or offline, the server switches transparently to a thread-safe, mutex-protected in-memory cache (`sync.RWMutex`), continuing to answer all REST calls and accept telemetry.
     - **Background Auto-Reconnect**: A background goroutine checks TimescaleDB every 5 seconds and reconnects automatically without restarting the backend process.
  3. **RESTful API Engine**:
     - `GET /health`: Health status and database connectivity indicator.
     - `POST /api/v1/auth/register`: Full user registration (Name, Mobile, Email, User ID, Password with bcrypt hashing), auto-provisioning initial personal workspace and issuing immediate JWT session.
     - `POST /api/v1/auth/login`: Authenticates via User ID or Email + password, returning user profile and signed HS256 JWT.
     - `GET /api/v1/auth/me`: Validates caller JWT identity and returns authenticated user profile (*Protected*).
     - `GET /api/v1/users`: Returns complete platform user directory with roles, contacts, and workspace counts (*Admin Only*).
     - `GET /api/v1/rules`: Lists dynamic threshold guardrail rules.
     - `POST /api/v1/rules`: Creates a new threshold rule (*Protected*).
     - `DELETE /api/v1/rules/{id}`: Deletes a threshold rule (*Protected*).
     - `GET /api/v1/alarms`: Lists active and historical guardrail alarms.
     - `POST /api/v1/alarms/{id}/acknowledge`: Acknowledges an active alarm (*Protected*).
     - `POST /api/v1/alarms/{id}/resolve`: Resolves an alarm (*Protected*).
     - `DELETE /api/v1/alarms/{id}`: Deletes an alarm from history (*Protected*).
     - `GET /api/v1/tenants`: Lists multi-tenant workspaces (user-scoped for standard users; global with owner metadata for administrators).
     - `POST /api/v1/tenants`: Creates a new tenant workspace tagged with caller identity (*Protected*).
     - `DELETE /api/v1/tenants/{id}`: Cascading workspace deletion with ownership validation (*Protected*).
     - `GET /api/v1/channels`: Lists logical channels (supports `?tenant_id=...`).
     - `POST /api/v1/channels`: Registers a logical telemetry channel / MQTT topic group.
     - `DELETE /api/v1/channels/{id}`: Deletes a telemetry channel (*Protected*).
     - `GET /api/v1/devices`: Lists registered edge devices with optional `tenant_id`, `channel_id`, and `status` query filters.
     - `GET /api/v1/devices/{id}/telemetry/latest`: Fetches the latest sensor snapshot.
     - `GET /api/v1/devices/{id}/telemetry/history`: Retrieves time-series records supporting `limit`, `order=ASC|DESC`, and timestamp range filters.
     - `POST /api/v1/devices/{id}/telemetry`: Direct HTTP telemetry ingestion endpoint.
     - `POST /api/v1/telemetry`: Generalized telemetry ingestion endpoint.
     - `DELETE /api/v1/devices/{id}`: Deletes a device and purges all its telemetry data (*Protected*).
     - `POST /api/v1/devices/reset`: Purges all test devices and telemetry across the active workspace (*Protected*).
     - **JWT & API Key Middleware**: Sensitive routes require either a signed HS256 JWT (`Authorization: Bearer <token>`) or `X-API-Key: <key>`.
     - **Unit Testing Suite**: Full Go unit tests in `handlers_test.go` and `subscriber_test.go`.

---

### Service 4: React 18 + Vite Management Dashboard
- **Directory**: [`frontend/`](frontend/)
- **Entry Point**: [`frontend/src/App.jsx`](frontend/src/App.jsx)
- **Port**: `3000` (`http://localhost:3000`)
- **Architecture & Capabilities**:
  1. **Full-Page Authentication Gate (`AuthScreen.jsx`)**: Complete unauthenticated access protection on `http://localhost:3000` with Sign In (User ID or Email) and New User Registration (Name, Mobile, Email, User ID, Password).
  2. **Role-Based Two-Page Routing**:
     - **Admin Page (`AdminDashboard.jsx`)**: Dedicated mission control center for administrators with a 4-metric supervisory strip, cross-user workspace monitoring, database users directory, and read-only telemetry with all mutating operator clutter removed.
     - **User Page (`UserDashboard.jsx`)**: Dedicated workspace cockpit for regular operators with personal workspace management, hardware device registration, channel routing, dynamic threshold safety rules, and live telemetry trends.
  3. **5-Second Real-Time Polling Engine**: Built-in countdown timer (`5s` → `0s`) with automatic data re-fetching, live pause/resume toggle, and manual refresh button.
  4. **Dual Y-Axis Time-Series Chart**: Powered by Chart.js, rendering temperature on the left Y-axis (toggleable between °C and °F) and relative humidity (% RH) on the right Y-axis, including a multi-device comparison mode.
  5. **Full Deletion Lifecycle**: Dedicated delete buttons with confirmation prompts across Workspaces, Channels, and Devices.
  6. **First-Time User Onboarding Guide**: Dismissible onboarding banner and clean empty states guiding users on hardware connection without artificial mock data.
  7. **Clean Enterprise Light Theme**: Ultra-clean, high-contrast light theme engineered for crisp readability in plant and control room displays without clutter.

---

### Service 5: ESP32 Edge Firmware & Hardware Interface
- **Directory**: [`firmware/esp32-dht22/`](firmware/esp32-dht22/) (PlatformIO) & [`firmware/arduino-ide/`](firmware/arduino-ide/) (Arduino IDE)
- **Architecture & Capabilities**:
  1. **Non-Blocking Sampling Loop**: Samples the DHT22 sensor every 5 seconds without blocking CPU operations (`millis()` timers).
  2. **Dual Exponential Reconnect Backoff**: Implements exponential backoff (1s doubling up to 60s max) independently for WiFi disconnects and MQTT broker outages.
  3. **Last Will and Testament (LWT)**: Registers an automatic LWT message (`devices/<device_id>/status` with payload `"offline"` and retain=true).
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

### 🚀 Platform Execution Modes

| Feature / Mode | Mode A: Zero-Docker Lightweight Mode | Mode B: Full-Stack Containerized Mode |
| :--- | :--- | :--- |
| **Prerequisites** | Go 1.22+ and Node.js 18+ only | Docker Desktop, Go 1.22+, Node.js 18+ |
| **Database** | In-Memory Mutex-Protected Fallback Cache | TimescaleDB (PostgreSQL 16) with Hypertables |
| **Broker** | Optional (Use HTTP Ingest / Simulator) | Eclipse Mosquitto MQTT Broker (:1883) |
| **How to Start** | 1. `cd backend && go run main.go`<br>2. `cd frontend && npm run dev` | 1. `cd infra && docker compose up -d`<br>2. `cd backend && go run main.go`<br>3. `cd frontend && npm run dev` |
| **Telemetry Ingestion** | HTTP REST POST or Go CLI Simulator | Physical ESP32, Go CLI Simulator, or HTTP |
| **Ideal For** | Quick evaluation, grading, and presentation | Full production demonstration and hardware deployment |

---

## 🚀 Roadmap & Completed Milestones

| Stage | Focus Area | Status | Key Deliverables |
| :--- | :--- | :---: | :--- |
| **Infrastructure & Ingestion** | **Core Pipeline & Multi-Tenancy** | ✅ Complete | • Docker Compose for TimescaleDB & Mosquitto<br>• Relational schema with hypertable partitioning (`telemetry`) and $O(1)$ state cache (`latest_telemetry`)<br>• Go backend with Paho MQTT subscriber, device auto-registration, and REST APIs (`/health`, `/tenants`, `/channels`, `/devices`, `/telemetry`) |
| **Firmware & Hardware** | **ESP32 + DHT22 Edge Firmware** | ✅ Complete | • Non-blocking PlatformIO C++ firmware with dual exponential reconnect backoff (1s → 60s)<br>• Arduino IDE standalone sketch (`.ino`)<br>• Last Will and Testament (LWT) for instant offline detection<br>• Comprehensive hardware wiring schematics for 3-pin and 4-pin DHT22 sensors<br>• Multi-node Go CLI simulator for instant validation without physical hardware |
| **Frontend & Deletion** | **Dashboard & Management Lifecycle** | ✅ Complete | • Re-ordered navigation: Workspaces (Top) → Live Dashboard → Clients → Groups<br>• Full deletion lifecycle across Workspaces, Channels, and Devices with confirmation prompts<br>• 5-second polling engine with live countdown ticker, pause/resume, and manual refresh<br>• Welcoming first-time user onboarding banner & clean zero-mock states<br>• Dual Y-axis Chart.js line charts for Temperature (°C/°F) and Humidity (% RH) with tabular packet viewer |
| **Security & CI/CD** | **API Protection & Automated Pipeline** | ✅ Complete | • Admin API Key authentication middleware protecting deletion and reset routes<br>• Go unit tests for API handlers and MQTT ingestion payload parsing<br>• GitHub Actions CI pipeline (`.github/workflows/ci.yml`) automating backend tests and frontend Vite builds |

---

## 📂 Repository Structure

```
iot-platform/
├── .github/
│   └── workflows/
│       └── ci.yml                 # GitHub Actions CI workflow (Go tests & Vite build)
│
├── backend/                       # High-throughput Go backend service
│   ├── handlers/                  # REST API handlers, in-memory cache, DB queries
│   │   ├── handlers.go            # Handler implementations & AuthMiddleware
│   │   └── handlers_test.go       # Go unit tests for API handlers & deletions
│   ├── models/                    # Data transfer objects (DTOs) & database models
│   ├── mqtt/                      # Eclipse Paho MQTT subscriber & ingestion consumer
│   │   ├── subscriber.go          # MQTT client & message consumer
│   │   └── subscriber_test.go     # MQTT payload parsing unit tests
│   ├── go.mod                     # Go dependencies
│   ├── main.go                    # Service entry point & background reconnection loop
│   └── README.md                  # Backend API documentation & architecture
│
├── frontend/                      # Enterprise React web dashboard & management UI
│   ├── src/
│   │   ├── components/            # UI modular components
│   │   │   ├── AuthScreen.jsx     # Full-page Login & Registration gate portal (Initial Landing)
│   │   │   ├── AdminDashboard.jsx # Dedicated Admin Page (Supervisory Monitoring & User Oversight)
│   │   │   ├── UserDashboard.jsx  # Dedicated User Page (Personal Workspaces & Device Operations)
│   │   │   ├── Sidebar.jsx        # Navigation cards (Workspaces -> Dashboard -> Clients -> Groups)
│   │   │   ├── Header.jsx         # Health badge, timer, theme & unit toggles
│   │   │   ├── DeviceSelector.jsx # Device switcher with delete actions & empty states
│   │   │   ├── MetricCard.jsx     # Temperature, Humidity, and RSSI health cards
│   │   │   ├── TelemetryChart.jsx # Chart.js dual Y-axis historical trend lines
│   │   │   ├── RecentTable.jsx    # Live tabular packet viewer
│   │   │   ├── TenantsView.jsx    # Multi-tenant workspace management with delete support
│   │   │   ├── ChannelsView.jsx   # Logical telemetry channels with delete support
│   │   │   ├── DevicesView.jsx    # Edge client registry with trash / clear actions
│   │   │   ├── OnboardingGuide.jsx# First-time user onboarding banner & empty states
│   │   │   ├── AddDeviceModal.jsx # Quick device registration modal
│   │   │   ├── AddTenantModal.jsx # Add workspace modal
│   │   │   └── AddChannelModal.jsx# Add channel modal
│   │   ├── api.js                 # API client wrapper with auth headers
│   │   ├── App.jsx                # Core router gating AuthScreen, AdminDashboard & UserDashboard
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

The Go backend features **automatic fallback**: if TimescaleDB or Docker is offline, the backend runs in resilient in-memory mode, auto-reconnecting as soon as the database starts!

```bash
cd backend
go run main.go
```
The server will start on port `8080`.
Verify backend status in your terminal:
```bash
curl http://localhost:8080/health
```

Run unit tests:
```bash
go test -v ./...
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
- **Full-Page Authentication Gate**: First-time visitors are presented with the authentication portal.
  - **Register**: Create an account with your Name, Mobile Number, Email, User ID, and Password. Upon registration, your personal workspace is automatically initialized.
  - **Login**: Authenticate using your User ID or Email and password. To access superuser controls, log in with `admin` / `admin123`.
- Once authenticated, regular users manage their own personal workspaces; the platform administrator can inspect all users and all workspaces.
- Click **Live Dashboard** to view real-time 5-second countdown polling and trend charts.
- View live telemetry metric cards with °C / °F temperature toggling and Chart.js historical trend lines.

---

### 4. Firmware & ESP32 Flashing

1. Review the [Hardware Wiring Guide](docs/esp32_dht22_wiring_guide.md) to connect your DHT22 sensor to the ESP32:
   - **VCC** → 3.3V
   - **GND** → GND
   - **DATA** → GPIO 4 (with 10kΩ pull-up resistor if using 4-pin DHT22)
2. Configure credentials in `firmware/esp32-dht22/include/config.h`:
   - Set your WiFi SSID and Password.
   - Set your PC/Broker IP address on your local network.
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

---

## 🌟 Key Features

### Full-Page Login & User Registration Gate
- **Unauthenticated Access Gate**: Navigating to `http://localhost:3000` is gated behind `AuthScreen.jsx`.
- **User ID & Email Sign In**: Operators and developers can log in using either their registered User ID/Username or Email address.
- **New User Registration**: Captures Full Name, Mobile Number, Email Address, User ID, and Password (hashed via bcrypt).
- **Auto Workspace Provisioning**: Creates an initial personal workspace (e.g. `"<Name>'s Workspace"`) on signup so users immediately land on an active telemetry workspace.

### User-Scoped Workspaces & Superuser Admin Directory
- **Regular User Isolation (Creator Mode)**: Each user exclusively views and manages their own workspaces (`owner_id = user.id`), with full creation, configuration, and deletion capabilities over their resources.
- **Admin Superuser Dashboard (Supervisory Monitoring Mode)**: When the platform administrator (`admin`) logs in:
  - The dashboard operates in a dedicated **Supervisory Monitoring Mode**, cleanly removing unnecessary mutating clutter (`Create Workspace`, `Register Device`, `Add Channel`, `Clear All Devices`, delete buttons, and hardware onboarding banners).
  - All workspaces created across the entire system are visible with owner attribution pills (`Created by: <Name> • <Email>`).
  - An **Admin Supervisory Strip** summarizes total registered users, total monitored workspaces, and current active session.
  - An owner filter dropdown allows isolating workspaces by specific creators.
  - A dedicated **"Registered Users Directory"** tab lists all registered users, roles, contact numbers, and workspace counts.

### Top-Down Navigation Hierarchy
- **1. Workspaces (Top)**: Select, create, or delete organizational workspaces with complete data isolation.
- **2. Live Dashboard**: Primary real-time telemetry gauges, min/max metrics, and Chart.js historical trend lines.
- **3. Clients / Devices**: Edge node inventory with online indicators and device deletion actions.
- **4. Groups & Channels**: Logical telemetry channel routing streams.

### Guardrail Features (Dynamic Rules & Alarms)
- **JSON-Stored Dynamic Rules**: Operators can configure threshold rules (e.g. `temperature_c > 35.0`, `humidity_pct > 80.0`) dynamically stored in database or memory cache—never hardcoded in `if` statements.
- **Automated Lifecycle**: Evaluated during ingestion across MQTT and HTTP. Automatically raises `OPEN` alarms on violation and transitions to `RESOLVED` when telemetry normalizes.
- **Operator Actions**: UI supports live alarm counting badges, Acknowledge (`ACKNOWLEDGED`), Resolve (`RESOLVED`), and Delete.

### JWT Authentication & Role-Based Access Control
- **Standard HS256 Token Sessions**: Secure authentication via `/api/v1/auth/login` and `/api/v1/auth/register` issuing HMAC-SHA256 JWT tokens.
- **Header Verification**: Backend `AuthMiddleware` verifies Bearer tokens and backward-compatible `X-API-Key` headers on protected routes.
- **User Header Controls**: Header displays active caller's full name, `@username` badge, role pill (`ADMIN` vs `USER`), and a one-click Sign Out button.

### Full Deletion Lifecycle & Cascading Cleanup
- **Single-Click Device Deletion**: Cleanly removes sensor nodes and purges historical and latest telemetry records.
- **Workspace Deletion**: Deletes organizational workspaces and cascades through all child devices, channels, and telemetry.
- **Channel Deletion**: Safely unbinds and removes unused telemetry channels.
- **Confirmation Guards**: Destructive operations trigger browser confirmation dialogs before execution.
- **Protected Endpoints**: Deletion routes are guarded by `ADMIN_API_KEY` header verification.

### First-Time User Onboarding & Clean Zero-Mock States
- **Onboarding Banner**: Features an inviting, dismissible banner explaining the platform workflow.
- **Zero Mock Readings**: When no sensors are streaming, clean empty state cards guide the user without displaying artificial or fake temperatures.

### Resilient Backend Dual-Mode Operation
- **Database Mode**: Telemetry is partitioned across TimescaleDB hypertables with trigger-driven $O(1)$ latest telemetry caching.
- **In-Memory Mode**: If TimescaleDB is offline, an internal thread-safe in-memory cache handles all ingestion, latest readings, and history queries with HTTP 200 responses, automatically retrying the PostgreSQL connection in the background.

### Real-Time 5-Second Telemetry Engine
- Synchronized **5-second polling ticker** (`5s` → `1s`) with pause/resume controls and manual refresh.
- Displays live metric cards with temperature unit toggling (°C / °F), dynamic trend deltas, min/max metrics, and ESP32 WiFi RSSI signal strength.
- Chart.js powered historical line charts render smooth curves over dual Y-axes with real-time rolling window subqueries.

### Unit Testing & Automated CI Pipeline
- Full test coverage in `backend/handlers/handlers_test.go` and `backend/mqtt/subscriber_test.go`.
- Continuous Integration via **GitHub Actions** (`.github/workflows/ci.yml`) automatically builds and tests code on every push and pull request.

### Clean Enterprise Light Theme
- Standardized on an ultra-clean, high-contrast light theme engineered for maximum readability across operations displays and laboratory environments.

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
