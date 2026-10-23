# ⚙️ Go Backend Service & MQTT Ingestion Pipeline

[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go)](https://golang.org)
[![Database](https://img.shields.io/badge/TimescaleDB-PostgreSQL_16-FDB515?style=flat&logo=postgresql)](https://timescale.com)
[![MQTT](https://img.shields.io/badge/Paho_MQTT-v1.4.3-660066?style=flat&logo=eclipsemosquitto)](https://github.com/eclipse/paho.mqtt.golang)

The core application server for the IoT Platform, written in Go. It handles high-throughput MQTT telemetry ingestion from edge devices, auto-registration of microcontrollers, time-series storage in TimescaleDB, and serves low-latency REST APIs to the frontend dashboard.

---

## 📑 Table of Contents

- [Core Responsibilities](#core-responsibilities)
- [Resilient Dual-Mode Architecture](#resilient-dual-mode-architecture)
- [API Reference](#api-reference)
  - [System Health](#1-system-health)
  - [Device Management](#2-device-management)
  - [Telemetry Queries](#3-telemetry-queries)
  - [HTTP Telemetry Ingestion](#4-http-telemetry-ingestion)
- [MQTT Ingestion Pipeline](#mqtt-ingestion-pipeline)
  - [Subscribed Topics](#subscribed-topics)
  - [Payload Specification](#payload-specification)
  - [Auto-Registration & Device State](#auto-registration--device-state)
- [Running the Backend](#running-the-backend)
- [Environment Variables](#environment-variables)

---

## 🎯 Core Responsibilities

1. **High-Throughput MQTT Consumer**: Subscribes to edge topics (`devices/+/telemetry`) via Eclipse Paho MQTT.
2. **Multi-Tenant Data Routing**: Automatically isolates devices, channels, and time-series metrics by Tenant UUID.
3. **TimescaleDB Persistence**: Writes incoming readings into partitioned time-series hypertables and updates the $O(1)$ `latest_telemetry` snapshot table via SQL triggers.
4. **Resilient In-Memory Fallback**: When PostgreSQL is offline, transparently caches records in a thread-safe memory store so development and frontend testing never fail.
5. **RESTful Query Engine**: Provides filtered historical metric queries, latest state snapshots, device listing, and deletion endpoints.

---

## 🛡️ Resilient Dual-Mode Architecture

The backend implements an automatic **dual-mode operational fallback**:

```
+-------------------------------------------------------+
|                 Incoming Request / MQTT               |
+-------------------------------------------------------+
                           |
                           v
              +--------------------------+
              | Is TimescaleDB Online?   |
              +--------------------------+
                     /            \
             YES    /              \   NO (Temporary Offline)
                   v                v
      +------------------------+   +---------------------------+
      | TimescaleDB Hypertable |   | Thread-Safe In-Memory     |
      | - PostgreSQL 16        |   | Fallback Cache            |
      | - O(1) Cache Trigger   |   | - Sync Mutex Protected    |
      +------------------------+   | - Serves HTTP 200 OK      |
                                   +---------------------------+
                                                 |
                                    Background Reconnect Loop
                                    (Checks DB every 10 seconds)
```

- **Database Mode**: Queries and writes route to TimescaleDB with hypertable chunking and indexes.
- **Fallback Mode**: If Docker or TimescaleDB is stopped, the server continues listening on port 8080 and handles all REST API calls (`/devices`, `/telemetry/latest`, `/telemetry/history`, `/telemetry`) in-memory. A background goroutine periodically reconnects to PostgreSQL once it becomes available.

---

## 🌐 API Reference

Base URL: `http://localhost:8080`

### 1. System Health

#### `GET /health`
Returns the status of the backend service and database connectivity.

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "iot-backend",
  "database": "connected",
  "timestamp": "2026-10-16T14:45:00Z"
}
```

---

### 2. Device Management

#### `GET /api/v1/devices`
List all edge devices registered across the platform or filtered by tenant.

**Query Parameters:**
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `tenant_id` | `string` | Optional | Filter devices by Tenant UUID |
| `status` | `string` | Optional | Filter by status (`online`, `offline`) |

**Response (200 OK):**
```json
{
  "count": 1,
  "devices": [
    {
      "id": "c1f7a0b3-90d1-4f32-8e4a-563b719280cd",
      "tenant_id": "a0000000-0000-0000-0000-000000000001",
      "device_id": "esp32-node-alpha",
      "name": "Laboratory ESP32 Node",
      "device_type": "ESP32",
      "status": "online",
      "created_at": "2026-10-16T14:00:00Z",
      "updated_at": "2026-10-16T14:05:00Z"
    }
  ]
}
```

#### `DELETE /api/v1/devices/{id}`
Deletes a device from the database/cache and purges its historical and latest telemetry.

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Device and telemetry cleared successfully"
}
```

#### `POST /api/v1/devices/reset`
Purges all devices and telemetry records, restoring a clean workspace.

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "All devices and telemetry reset successfully"
}
```

---

### 3. Telemetry Queries

#### `GET /api/v1/devices/{id}/telemetry/latest`
Fetches the most recent telemetry packet for a specific device from the $O(1)$ snapshot cache.

**Response (200 OK):**
```json
{
  "device_id": "esp32-node-alpha",
  "tenant_id": "a0000000-0000-0000-0000-000000000001",
  "time": "2026-10-16T14:05:00Z",
  "payload": {
    "temperature_c": 24.3,
    "humidity_pct": 55.4,
    "wifi_rssi": -62,
    "uptime_s": 720,
    "seq": 144
  }
}
```

#### `GET /api/v1/devices/{id}/telemetry/history`
Queries time-series telemetry records from the TimescaleDB hypertable.

**Query Parameters:**
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `limit` | `int` | `100` | Max records to return (1–1000) |
| `order` | `string` | `DESC` | Sort order: `ASC` (chronological rolling window of latest N points for charts) or `DESC` (most recent first) |
| `start` / `from` | `RFC3339` | None | Start time boundary (e.g. `2026-10-16T10:00:00Z`) |
| `end` / `to` | `RFC3339` | None | End time boundary |

**Response (200 OK):**
```json
{
  "device_id": "esp32-node-alpha",
  "count": 50,
  "history": [
    {
      "time": "2026-10-16T14:05:00Z",
      "device_id": "esp32-node-alpha",
      "tenant_id": "a0000000-0000-0000-0000-000000000001",
      "payload": {
        "temperature_c": 24.3,
        "humidity_pct": 55.4,
        "wifi_rssi": -62,
        "uptime_s": 720,
        "seq": 144
      }
    }
  ]
}
```

---

### 4. HTTP Telemetry Ingestion

Allows posting sensor data via HTTP REST as an alternative to MQTT (useful for web testing, curl, or HTTP-only nodes).

#### `POST /api/v1/devices/{id}/telemetry`
**Request Body:**
```json
{
  "tenant_id": "a0000000-0000-0000-0000-000000000001",
  "temperature_c": 23.8,
  "humidity_pct": 52.1,
  "wifi_rssi": -55,
  "uptime_s": 120,
  "seq": 24
}
```

#### `POST /api/v1/telemetry`
**Request Body:**
```json
{
  "device_id": "esp32-node-alpha",
  "tenant_id": "a0000000-0000-0000-0000-000000000001",
  "temperature_c": 23.8,
  "humidity_pct": 52.1
}
```

---

## 📡 MQTT Ingestion Pipeline

### Subscribed Topics
1. `devices/+/telemetry` — Standard edge topic where wildcard `+` is the `device_id`.
2. `tenants/+/devices/+/telemetry` — Multi-tenant topic with explicit tenant UUID.
3. `iot/telemetry` — Legacy broadcast topic.

### Payload Specification
ESP32 firmware publishes JSON at 5-second intervals with QoS 1:

```json
{
  "device_id": "esp32-node-alpha",
  "tenant_id": "a0000000-0000-0000-0000-000000000001",
  "temperature_c": 24.3,
  "humidity_pct": 55.4,
  "wifi_rssi": -58,
  "uptime_s": 525,
  "seq": 105
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `device_id` | `string` | Unique identifier of the edge node |
| `tenant_id` | `string` | UUID of the tenant workspace |
| `temperature_c` | `float` | Ambient temperature in degrees Celsius (DHT22 sensor) |
| `humidity_pct` | `float` | Relative humidity percentage (DHT22 sensor) |
| `wifi_rssi` | `int` | WiFi signal strength in dBm |
| `uptime_s` | `int` | ESP32 board uptime in seconds since boot |
| `seq` | `int` | Monotonically increasing packet sequence counter |

### Auto-Registration & Device State
When a new device publishes telemetry for the first time:
- The backend automatically inserts it into the `devices` table with status `online`.
- The device's `updated_at` timestamp is updated with every incoming packet.
- If the device disconnects abruptly, Mosquitto fires the configured **Last Will and Testament (LWT)** message to mark the device `offline`.

---

## 🚀 Running the Backend

From the repository root:
```bash
go run backend/main.go
```

Or from the `backend/` folder:
```bash
cd backend
go run main.go
```

### Testing Ingestion with the Node Simulator
Simulate 2 edge nodes publishing to Mosquitto:
```bash
go run firmware/tools/simulate_nodes.go -broker tcp://localhost:1883 -nodes 2
```

---

## 🔧 Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `8080` | Port for the HTTP REST server |
| `DB_HOST` | `localhost` | PostgreSQL / TimescaleDB host |
| `DB_PORT` | `5433` | PostgreSQL / TimescaleDB port |
| `DB_USER` | `postgres` | Database username |
| `DB_PASSWORD` | `postgres` | Database password |
| `DB_NAME` | `iot_platform` | Database name |
| `MQTT_BROKER` | `tcp://localhost:1883`| Mosquitto broker URI |
