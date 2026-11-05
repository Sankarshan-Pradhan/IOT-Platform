# 🐳 Infrastructure Services (TimescaleDB, Mosquitto, Backend & Frontend)

[![Docker Compose](https://img.shields.io/badge/Docker_Compose-v2+-2496ED?style=flat&logo=docker)](https://docs.docker.com/compose/)
[![TimescaleDB](https://img.shields.io/badge/TimescaleDB-PostgreSQL_16-FDB515?style=flat&logo=postgresql)](https://timescale.com)
[![Mosquitto](https://img.shields.io/badge/Eclipse_Mosquitto-2.0-660066?style=flat&logo=eclipsemosquitto)](https://mosquitto.org)

Containerized infrastructure for the IoT Platform. Manages the Eclipse Mosquitto MQTT message broker and TimescaleDB time-series database with automated hypertable partitioning, continuous aggregate rollups, retention policies, and state synchronization triggers.

---

## 📑 Table of Contents

- [Services Overview](#services-overview)
- [Directory Layout](#directory-layout)
- [Quick Start](#quick-start)
- [Database Schema & Migrations (`init.sql`)](#database-schema--migrations-initsql)
- [Continuous Aggregates & Retention Policies](#continuous-aggregates--retention-policies)
- [Mosquitto MQTT Configuration (`mosquitto.conf`)](#mosquitto-mqtt-configuration-mosquittoconf)
- [Environment Configuration (`.env`)](#environment-configuration-env)
- [Troubleshooting & Verification](#troubleshooting--verification)

---

## 🏗️ Services Overview

| Service | Container Name | Host Port | Internal Port | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **TimescaleDB** | `iot_postgres` | `5433` | `5432` | PostgreSQL 16 with TimescaleDB extension for time-series hypertables & rollups |
| **Mosquitto** | `iot_mosquitto` | `1883`, `9001` | `1883`, `9001` | MQTT 3.1.1 / 5.0 broker with native TCP & WebSocket support |
| **Backend API** | `iot_backend` | `8080` | `8080` | Go REST server, native SSE streaming, downsampler, alert dispatchers |
| **Frontend UI** | `iot_frontend` | `3000` | `80` | Production React 18 dashboard served via Nginx reverse proxy |

---

## 📁 Directory Layout

```
infra/
├── docker-compose.yml        # Multi-container orchestration definition
├── init.sql                  # Database schema, hypertables, rollups & trigger migrations
├── mosquitto.conf            # Mosquitto broker network & security settings
├── .env.example              # Environment variables template
├── .env                      # Active environment variables (git-ignored)
└── README.md                 # Infrastructure documentation
```

---

## ⚡ Quick Start

### 1. Initialize Environment
Copy `.env.example` to `.env`:
```bash
cd infra
cp .env.example .env
```

### 2. Launch Containers
Start the infrastructure in detached mode:
```bash
docker compose up -d
```

### 3. Check Container Health
```bash
docker compose ps
```
All containers should report status `running (healthy)`.

### 4. Stop Containers
```bash
docker compose down
```
To stop and wipe persistent database volumes (clean reset):
```bash
docker compose down -v
```

---

## 🗄️ Database Schema & Migrations (`init.sql`)

When TimescaleDB boots for the first time, `init.sql` automatically runs the database migrations:

1. **Extensions**:
   - `timescaledb`: Enables time-series chunking, hypertables, continuous aggregates, and retention policies.
   - `pgcrypto`: Generates RFC 4122 cryptographic UUIDs.

2. **Tables**:
   - `users`: User authentication accounts with bcrypt password hashes, contact details, and role (`admin` vs `user`).
   - `tenants`: Multi-tenant organization boundaries with owner tracking (`owner_id`, `owner_name`, `owner_email`).
   - `channels`: Logical telemetry channels and MQTT routing definitions.
   - `devices`: Registered edge microcontrollers (`ESP32`, auth token, firmware version, status `online`/`offline`).
   - `rules`: Dynamic threshold guardrail safety policies.
   - `alarms`: Real-time triggered and historical threshold violation records.
   - `device_commands`: Downlink hardware control action logs and acknowledgments.
   - `telemetry` *(Hypertable)*: Append-only time-series table partitioned into time chunks.
   - `latest_telemetry` *(Snapshot Cache)*: Fast $O(1)$ table storing the most recent reading for each device.

3. **Automation Trigger**:
   - `update_latest_telemetry_trigger`: Fires on every `INSERT` into `telemetry`, atomically updating `latest_telemetry` so dashboard queries never need to scan millions of historical rows.

---

## 📈 Continuous Aggregates & Retention Policies

1. **Continuous Aggregate Views**:
   - `telemetry_1m`: 1-minute rollup bucket (`avg`, `min`, `max`, `count`) for fast short-term metrics.
   - `telemetry_5m`: 5-minute continuous aggregate rollup for trend charts.
   - `telemetry_1h`: 1-hour rollup for long-range historical analysis.
   - Automatic refresh policies scheduled via `add_continuous_aggregate_policy()`.

2. **Retention Policy**:
   - `add_retention_policy('telemetry', INTERVAL '30 days')`: Automatically drops raw hypertable chunks older than 30 days to keep database storage compact and fast.

---

## 📡 Mosquitto MQTT Configuration (`mosquitto.conf`)

The Mosquitto configuration enables high-throughput local communication:
- **Port**: `1883` bound to all interfaces (`0.0.0.0`) for TCP MQTT.
- **WebSocket Port**: `9001` for direct browser MQTT connections.
- **Anonymous Access**: `allow_anonymous true` for rapid local prototyping (can be secured with username/password authentication for production).
- **Persistence**: Retains MQTT subscriptions across restarts.

---

## ⚙️ Environment Configuration (`.env`)

```ini
# PostgreSQL / TimescaleDB Configuration
POSTGRES_USER=iot_user
POSTGRES_PASSWORD=iot_secure_password
POSTGRES_DB=iot_platform
POSTGRES_PORT=5433

# Mosquitto MQTT Broker Configuration
MQTT_PORT=1883
MQTT_WS_PORT=9001
```

---

## 🔍 Troubleshooting & Verification

### Test Mosquitto Broker Connectivity
Using Mosquitto CLI tools:
```bash
# In terminal 1 (Subscriber):
mosquitto_sub -h localhost -p 1883 -t "devices/+/telemetry" -v

# In terminal 2 (Publisher):
mosquitto_pub -h localhost -p 1883 -t "devices/test-node/telemetry" -m '{"temperature_c": 22.5, "humidity_pct": 50.0}'
```

### Connect to TimescaleDB via psql
```bash
docker exec -it iot_postgres psql -U iot_user -d iot_platform
```
Query continuous aggregates:
```sql
SELECT * FROM telemetry_1m LIMIT 5;
```
