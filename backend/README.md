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
  - [Authentication & JWT Security](#authentication--jwt-security)
  - [System Health](#1-system-health)
  - [Authentication & User Registration](#2-authentication--user-registration)
  - [User Directory (Admin Only)](#3-user-directory-admin-only)
  - [Workspace / Tenant Management](#4-workspace--tenant-management)
  - [Channel Management](#5-channel-management)
  - [Device Management](#6-device-management)
  - [Guardrail Threshold Rules](#7-guardrail-threshold-rules)
  - [Guardrail Alarms Lifecycle](#8-guardrail-alarms-lifecycle)
  - [Telemetry Queries](#9-telemetry-queries)
  - [HTTP Telemetry Ingestion](#10-http-telemetry-ingestion)
- [MQTT Ingestion Pipeline](#mqtt-ingestion-pipeline)
  - [Subscribed Topics](#subscribed-topics)
  - [Payload Specification](#payload-specification)
  - [Auto-Registration & Device State](#auto-registration--device-state)
- [Running the Backend](#running-the-backend)
- [Unit Testing & CI Pipeline](#unit-testing--ci-pipeline)
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

### Authentication & JWT Security
Protected management, deletion, and threshold configuration endpoints support two authentication modes:
- **JWT Bearer Token**: Standard HMAC-SHA256 (HS256) JWT issued via `/api/v1/auth/login`. Header: `Authorization: Bearer <jwt_token>`.
- **API Key**: Static secret for automation scripts and microcontrollers. Header: `X-API-Key: <ADMIN_API_KEY>` or `Authorization: Bearer <ADMIN_API_KEY>`.
- **Default Dev Credentials**:
  - Username: `admin` | Password: `admin123` (configurable via `ADMIN_USERNAME` / `ADMIN_PASSWORD`)
  - API Key: `iot_admin_secret_key_2026` (configurable via `ADMIN_API_KEY`)
  - JWT Secret: `iot_platform_secret_jwt_key_2026_super_secure` (configurable via `JWT_SECRET`)

---

### 1. System Health

#### `GET /health`
Returns the status of the backend service and database connectivity.

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "iot-backend",
  "database": "connected",
  "timestamp": "2026-11-04T12:00:00Z"
}
```

---

### 2. Authentication & User Registration

#### `POST /api/v1/auth/register`
Registers a new user account with personal details and bcrypt hashed password storage. Upon successful registration, the backend automatically generates an initial personal workspace (e.g. `"<Name>'s Workspace"`) and issues an immediate signed HS256 JWT session.

**Request Body:**
```json
{
  "name": "Jane Doe",
  "mobile": "+1-555-0199",
  "email": "jane@example.com",
  "username": "janedoe",
  "password": "SecurePassword123"
}
```

**Response (201 Created):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2026-11-05T12:00:00Z",
  "user": {
    "id": "u-b8e1f02a-...",
    "username": "janedoe",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "mobile": "+1-555-0199",
    "role": "user"
  },
  "default_tenant": {
    "id": "d1a2b3c4-...",
    "name": "Jane Doe's Workspace",
    "slug": "jane-doe-workspace",
    "owner_id": "u-b8e1f02a-...",
    "owner_name": "Jane Doe",
    "owner_email": "jane@example.com"
  }
}
```

#### `POST /api/v1/auth/login`
Authenticates credentials (accepts either **User ID / Username** or **Email**) against bcrypt password hashes and returns user details with a signed HS256 JWT valid for 24 hours.

**Request Body:**
```json
{
  "username": "janedoe",
  "password": "SecurePassword123"
}
```
*(Also supports: `"username": "jane@example.com"`)*

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2026-11-05T12:00:00Z",
  "user": {
    "id": "u-b8e1f02a-...",
    "username": "janedoe",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "mobile": "+1-555-0199",
    "role": "user"
  }
}
```

#### `GET /api/v1/auth/me` *(Protected)*
Validates the caller's JWT token and returns their authenticated profile.

**Response (200 OK):**
```json
{
  "status": "authenticated",
  "user": {
    "id": "u-b8e1f02a-...",
    "username": "janedoe",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "mobile": "+1-555-0199",
    "role": "user"
  }
}
```

---

### 3. User Directory (Admin Only)

#### `GET /api/v1/users` *(Protected - Admin Only)*
Returns a list of all registered platform users along with their role, contact details, registration timestamps, and total owned workspace counts. Non-admin callers receive `403 Forbidden`.

**Response (200 OK):**
```json
{
  "count": 2,
  "users": [
    {
      "id": "u-admin-001",
      "username": "admin",
      "name": "Platform Administrator",
      "email": "admin@iot-platform.local",
      "mobile": "+1-800-555-0100",
      "role": "admin",
      "created_at": "2026-11-04T00:00:00Z",
      "workspaces_count": 1
    },
    {
      "id": "u-b8e1f02a-...",
      "username": "janedoe",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "mobile": "+1-555-0199",
      "role": "user",
      "created_at": "2026-11-04T10:15:00Z",
      "workspaces_count": 2
    }
  ]
}
```

---

### 4. Workspace / Tenant Management

#### `GET /api/v1/tenants` *(Protected / Scoped)*
Lists workspaces.
- **Regular Users**: Automatically filtered to only workspaces owned by the authenticated caller (`owner_id = user.id`).
- **Administrators (`admin`)**: Returns all workspaces created across all users in the system, populated with owner metadata (`owner_id`, `owner_name`, `owner_email`).

**Response (200 OK):**
```json
{
  "count": 1,
  "tenants": [
    {
      "id": "a0000000-0000-0000-0000-000000000001",
      "name": "Jane Doe's Workspace",
      "slug": "jane-doe-workspace",
      "description": "Personal IoT telemetry workspace",
      "owner_id": "u-b8e1f02a-...",
      "owner_name": "Jane Doe",
      "owner_email": "jane@example.com"
    }
  ]
}
```

#### `POST /api/v1/tenants` *(Protected)*
Creates a new tenant workspace stamped with the caller's owner ID, name, and email.

**Request Body:**
```json
{
  "name": "Production Plant Alpha",
  "slug": "plant-alpha",
  "description": "Main manufacturing assembly line sensors"
}
```

#### `DELETE /api/v1/tenants/{id}` *(Protected)*
Deletes a tenant workspace and performs cascading cleanup of all associated devices, channels, and telemetry records. Regular users can only delete workspaces they own; administrators have permission to delete any workspace.

**Response (200 OK):**
```json
{
  "status": "success",
  "id": "a0000000-0000-0000-0000-000000000001",
  "message": "Tenant workspace and all associated resources deleted successfully"
}
```

---

### 5. Channel Management

#### `GET /api/v1/channels`
Lists all logical telemetry channels. Supports optional `?tenant_id=...` filter.

**Response (200 OK):**
```json
{
  "count": 2,
  "channels": [
    {
      "id": "chan-dht22-alpha",
      "tenant_id": "a0000000-0000-0000-0000-000000000001",
      "name": "Laboratory Environmental Sensors",
      "group": "Environmental Monitoring",
      "topic": "devices/+/telemetry",
      "description": "DHT22 sensors streaming temperature and humidity every 5s.",
      "devices_count": 0
    }
  ]
}
```

#### `POST /api/v1/channels`
Registers a new telemetry channel / MQTT topic group.

**Request Body:**
```json
{
  "name": "Server Room HVAC Control",
  "group": "Server Room HVAC",
  "topic": "channels/chan-hvac-zone1/telemetry",
  "description": "Critical cooling and humidity threshold telemetry"
}
```

#### `DELETE /api/v1/channels/{id}` *(Protected)*
Deletes a telemetry channel from memory cache and TimescaleDB.

**Response (200 OK):**
```json
{
  "status": "success",
  "id": "chan-hvac-zone1",
  "message": "Channel deleted successfully"
}
```

---

### 6. Device Management

#### `GET /api/v1/devices`
List all edge devices registered across the platform or filtered by tenant.

**Query Parameters:**
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `tenant_id` | `string` | Optional | Filter devices by Tenant UUID |
| `channel_id` | `string` | Optional | Filter devices by Channel ID |
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

### 7. Guardrail Threshold Rules

Dynamic, JSON-defined safety rules that continuously guard against threshold violations.
> **Zero Hardcoded Logic**: Rules are evaluated dynamically (`evaluateCondition`) against incoming payload keys (`temperature_c`, `humidity_pct`, `wifi_rssi`) using operators `>`, `>=`, `<`, `<=`, `==`, `!=`.

#### `GET /api/v1/rules`
Lists configured threshold rules. Supports optional `?tenant_id=...` filter.

**Response (200 OK):**
```json
{
  "count": 1,
  "rules": [
    {
      "id": "rule-temp-overheat",
      "tenant_id": "a0000000-0000-0000-0000-000000000001",
      "name": "High Temperature Overheat Guardrail",
      "description": "Triggers an OPEN alarm when ambient temperature exceeds 35.0°C safety threshold.",
      "field": "temperature_c",
      "operator": ">",
      "threshold": 35.0,
      "severity": "CRITICAL",
      "enabled": true
    }
  ]
}
```

#### `POST /api/v1/rules` *(Protected)*
Creates a new dynamic guardrail threshold rule.

**Request Body:**
```json
{
  "tenant_id": "a0000000-0000-0000-0000-000000000001",
  "name": "High Humidity Alert",
  "field": "humidity_pct",
  "operator": ">",
  "threshold": 80.0,
  "severity": "WARNING",
  "enabled": true
}
```

#### `DELETE /api/v1/rules/{id}` *(Protected)*
Deletes a guardrail rule from memory cache and TimescaleDB.

---

### 8. Guardrail Alarms Lifecycle

Alarms are generated automatically during ingestion (`ProcessTelemetry`) across both MQTT and HTTP pipelines.
- **`OPEN`**: Generated when sensor reading violates the rule condition (e.g., `temperature_c > 35.0`).
- **`ACKNOWLEDGED`**: Operator acknowledges active alarm in UI without clearing violation state.
- **`RESOLVED`**: Automatically resolved when telemetry normalizes below threshold, or manually resolved via API.

#### `GET /api/v1/alarms`
Lists active or historical alarms. Supports `?tenant_id=...` and `?status=OPEN|RESOLVED` filters.

**Response (200 OK):**
```json
{
  "count": 1,
  "alarms": [
    {
      "id": "alarm-esp32-node-1",
      "tenant_id": "a0000000-0000-0000-0000-000000000001",
      "rule_id": "rule-temp-overheat",
      "device_id": "esp32-node-alpha",
      "rule_name": "High Temperature Overheat Guardrail",
      "severity": "CRITICAL",
      "status": "OPEN",
      "trigger_value": 37.8,
      "threshold": 35.0,
      "message": "Guardrail triggered: temperature_c is 37.8 (> 35.0 in rule 'High Temperature Overheat Guardrail')",
      "triggered_at": "2026-11-04T12:00:00Z"
    }
  ]
}
```

#### `POST /api/v1/alarms/{id}/acknowledge` *(Protected)*
Transitions alarm status from `OPEN` to `ACKNOWLEDGED`.

#### `POST /api/v1/alarms/{id}/resolve` *(Protected)*
Manually resolves an active alarm, stamping `resolved_at`.

#### `DELETE /api/v1/alarms/{id}` *(Protected)*
Purges an alarm record from history.

---

### 9. Telemetry Queries

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

### 10. HTTP Telemetry Ingestion

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

## 🧪 Unit Testing & CI Pipeline

The backend includes comprehensive Go unit tests covering API handlers, in-memory CRUD operations, tenant cascading deletions, and MQTT payload parsing.

Run all tests:
```bash
go test -v ./...
```

Run tests with race detection and fresh count:
```bash
go test -count=1 -race ./...
```

Automated CI executes via **GitHub Actions** (`.github/workflows/ci.yml`) on every push and pull request, validating Go backend tests and frontend Vite builds.

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
| `ADMIN_API_KEY`| `iot_admin_secret_key_2026` | Secret key protecting DELETE and reset endpoints |
| `JWT_SECRET` | `iot_platform_secret_jwt_key_2026_super_secure` | HMAC-SHA256 signing secret for session JWTs |
| `ADMIN_USERNAME` | `admin` | Default platform administrator username |
| `ADMIN_PASSWORD` | `admin123` | Default platform administrator password |
