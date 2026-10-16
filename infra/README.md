# 🐳 Infrastructure Services (TimescaleDB & Mosquitto)

[![Docker Compose](https://img.shields.io/badge/Docker_Compose-v2+-2496ED?style=flat&logo=docker)](https://docs.docker.com/compose/)
[![TimescaleDB](https://img.shields.io/badge/TimescaleDB-PostgreSQL_16-FDB515?style=flat&logo=postgresql)](https://timescale.com)
[![Mosquitto](https://img.shields.io/badge/Eclipse_Mosquitto-2.0-660066?style=flat&logo=eclipsemosquitto)](https://mosquitto.org)

Containerized infrastructure for the IoT Platform. Manages the Eclipse Mosquitto MQTT message broker and TimescaleDB time-series database with automated hypertable partitioning and state synchronization triggers.

---

## 📑 Table of Contents

- [Services Overview](#services-overview)
- [Directory Layout](#directory-layout)
- [Quick Start](#quick-start)
- [Database Schema & Migrations (`init.sql`)](#database-schema--migrations-initsql)
- [Mosquitto MQTT Configuration (`mosquitto.conf`)](#mosquitto-mqtt-configuration-mosquittoconf)
- [Environment Configuration (`.env`)](#environment-configuration-env)
- [Troubleshooting & Verification](#troubleshooting--verification)

---

## 🏗️ Services Overview

| Service | Container Name | Host Port | Internal Port | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **TimescaleDB** | `iot_timescaledb` | `5433` | `5432` | PostgreSQL 16 with TimescaleDB extension for time-series hypertables |
| **Mosquitto** | `iot_mosquitto` | `1883` | `1883` | MQTT 3.1.1 / 5.0 broker for edge microcontroller telemetry ingestion |

---

## 📁 Directory Layout

```
infra/
├── docker-compose.yml        # Multi-container orchestration definition
├── init.sql                  # Database schema, hypertables, and trigger migrations
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
Both `iot_timescaledb` and `iot_mosquitto` should report status `running (healthy)`.

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
   - `timescaledb`: Enables time-series chunking, hypertables, and continuous aggregates.
   - `pgcrypto`: Generates RFC 4122 cryptographic UUIDs.

2. **Tables**:
   - `tenants`: Multi-tenant organization boundaries.
   - `channels`: Logical telemetry channels and MQTT routing definitions.
   - `devices`: Registered edge microcontrollers (`ESP32`, status `online`/`offline`).
   - `telemetry` *(Hypertable)*: Append-only time-series table partitioned into 7-day chunks.
   - `latest_telemetry` *(Snapshot Cache)*: Fast $O(1)$ table storing the most recent reading for each device.

3. **Automation Trigger**:
   - `update_latest_telemetry_trigger`: Fires on every `INSERT` into `telemetry`, atomically updating `latest_telemetry` so dashboard queries never need to scan millions of historical rows.

---

## 📡 Mosquitto MQTT Configuration (`mosquitto.conf`)

The Mosquitto configuration enables high-throughput local communication:
- **Port**: `1883` bound to all interfaces (`0.0.0.0`).
- **Anonymous Access**: `allow_anonymous true` for rapid local prototyping (can be secured with username/password authentication for production).
- **Persistence**: Retains MQTT subscriptions across restarts.

---

## ⚙️ Environment Configuration (`.env`)

```ini
# PostgreSQL / TimescaleDB Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=iot_platform
TIMESCALEDB_PORT=5433

# Mosquitto MQTT Broker Configuration
MOSQUITTO_PORT=1883
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
docker exec -it iot_timescaledb psql -U postgres -d iot_platform
```
Query registered devices:
```sql
SELECT device_id, name, status, updated_at FROM devices;
```
