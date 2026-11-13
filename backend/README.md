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

### Authentication, JWT Precedence & Tenant Isolation
All sensitive management, streaming, configuration, and telemetry query endpoints enforce role-based access control (RBAC):
- **User JWT Authorization Precedence**: Signed HMAC-SHA256 (HS256) session tokens issued via `/api/v1/auth/login` or `/api/v1/auth/register`. When both a JWT token and a static API key are present (e.g. via headers or query parameters), the backend **strictly prioritizes the signed user JWT claims** over any static API key, preventing unauthorized privilege escalation.
  - Header: `Authorization: Bearer <jwt_token>`
  - Query Parameter: `?token=<jwt_token>` (Supported on SSE `/api/v1/telemetry/stream`)
- **API Key Authentication**: Static secret for automation scripts and backend-to-backend tooling.
  - Header: `X-API-Key: <ADMIN_API_KEY>` or `Authorization: Bearer <ADMIN_API_KEY>`
  - Query Parameter: `?api_key=<ADMIN_API_KEY>`
- **Tenant Isolation & Resource Ownership**:
  - Regular users (`role: user`) are strictly restricted to entities in workspaces they own (`owner_id = user.id`).
  - Calls to list devices, channels, rules, alarms, or query telemetry automatically filter or validate tenant ownership against the caller's authorized workspace list. Attempting to query or modify resources belonging to another tenant returns `403 Forbidden`.
  - Platform administrators (`role: admin`) retain supervisory oversight across all workspaces.
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
Deletes a tenant workspace and performs cascading cleanup of all associated devices, channels, and telemetry records.
- **Ownership Verification**: Regular users can only delete workspaces they created (`owner_id = user.id`).
- **System Workspace Safeguard**: Regular users are strictly prevented from deleting system or default workspaces (e.g. `default-org` or `a0000000-0000-0000-0000-000000000001`). Only platform administrators can delete these workspaces.

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

#### `GET /api/v1/channels` *(Protected / Scoped)*
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

#### `POST /api/v1/channels` *(Protected / Scoped)*
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

#### `GET /api/v1/devices` *(Protected / Scoped)*
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

#### `DELETE /api/v1/devices/{id}` *(Protected / Scoped)*
Deletes a device from the database/cache and purges its historical and latest telemetry.

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Device and telemetry cleared successfully"
}
```

#### `POST /api/v1/devices/reset` *(Protected - Admin Only)*
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

#### `GET /api/v1/rules` *(Protected / Scoped)*
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

#### `POST /api/v1/rules` *(Protected / Scoped)*
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

#### `DELETE /api/v1/rules/{id}` *(Protected / Scoped)*
Deletes a guardrail rule from memory cache and TimescaleDB.

---

### 8. Guardrail Alarms Lifecycle

Alarms are generated automatically during ingestion (`ProcessTelemetry`) across both MQTT and HTTP pipelines.
- **`OPEN`**: Generated when sensor reading violates the rule condition (e.g., `temperature_c > 35.0`).
- **`ACKNOWLEDGED`**: Operator acknowledges active alarm in UI without clearing violation state.
- **`RESOLVED`**: Automatically resolved when telemetry normalizes below threshold, or manually resolved via API.

#### `GET /api/v1/alarms` *(Protected / Scoped)*
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

#### `GET /api/v1/devices/{id}/telemetry/latest` *(Protected / Scoped)*
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

#### `GET /api/v1/devices/{id}/telemetry/history` *(Protected / Scoped)*
Queries time-series telemetry records from the TimescaleDB hypertable.

**Query Parameters:**
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `limit` | `int` | `100` | Max records to return (1–1000) |
| `order` | `string` | `DESC` | Sort order: `ASC` (chronological rolling window of latest N points for charts) or `DESC` (most recent first) |
| `resolution` | `string` | `raw` | TimescaleDB Continuous Aggregate rollup: `raw`, `1m` (1-min buckets), `5m` (5-min buckets), or `1h` (1-hour buckets) |
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

### 11. Zero-Latency Real-Time Streaming (SSE)

#### `GET /api/v1/telemetry/stream` *(Protected)*
Establishes an authenticated HTTP Server-Sent Events (SSE) connection streaming real-time events directly to UI clients with zero polling latency. Unauthenticated connection attempts receive `401 Unauthorized`.

* **Authentication:** Pass JWT via `Authorization: Bearer <jwt>` or query param `?token=<jwt>` (or `X-API-Key: <key>` / `?api_key=<key>`).
* **Headers:** `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
* **Heartbeat:** Automated 15-second ping (`:keepalive\n\n`) preventing proxy timeouts.
* **Events Broadcasted:**
  * `event: telemetry` — Fired immediately upon ingestion of any sensor packet.
  * `event: alarm` — Fired when a guardrail rule triggers or resolves.
  * `event: command_ack` — Fired when an edge node acknowledges a downlink command.
  * `event: device_status` — Fired when an edge device reports status changes or times out.

---

### 12. Downlink Device Control & Actuation

#### `POST /api/v1/devices/{id}/commands` *(Protected)*
Dispatches a downlink command to an edge microcontroller via MQTT topic `devices/{id}/commands`.

**Request Body:**
```json
{
  "action": "set_relay",
  "payload": {
    "relay_id": 1,
    "state": true
  }
}
```

*Supported Actions:*
- `set_relay`: `{"relay_id": 1, "state": true|false}`
- `toggle_led`: `{"state": true|false}`
- `set_interval`: `{"interval_ms": 1000 - 60000}`
- `reboot`: `{}`

#### `GET /api/v1/devices/{id}/commands` *(Protected)*
Returns the recent audit log of dispatched downlink commands and their acknowledgment statuses (`PENDING`, `ACKNOWLEDGED`, `FAILED`).

#### `POST /api/v1/devices/{id}/command_ack`
HTTP acknowledgment callback endpoint for simulated nodes or HTTP-only devices.

---

### 13. Outbound Alarm Notification Channels

#### `GET /api/v1/notifications/channels` *(Protected)*
Lists all registered outbound alert dispatch channels.

#### `POST /api/v1/notifications/channels` *(Protected)*
Registers a new notification channel for automated alerting when `CRITICAL` alarms fire.

**Request Body:**
```json
{
  "name": "Ops Incident Discord",
  "type": "discord",
  "target_url": "https://discord.com/api/webhooks/...",
  "severity": "CRITICAL"
}
```
*Supported Types:* `discord`, `slack`, `webhook`.

#### `DELETE /api/v1/notifications/channels/{id}` *(Protected)*
Deletes an alert notification channel.

#### `POST /api/v1/notifications/test` *(Protected)*
Sends a test notification ping to verify webhook connectivity.

---

### 14. Historical Telemetry Export (CSV & JSON)

#### `GET /api/v1/devices/{id}/telemetry/export` *(Protected / Scoped)*
Streams historical telemetry directly as downloadable attachments for offline analytics or audit reports.

**Query Parameters:**
- `format`: `csv` (default) or `json`.
- `limit`: Maximum rows to export (default 5000, max 50000).
- `start` / `end`: Optional ISO-8601 time boundaries.

**Headers Returned:**
`Content-Disposition: attachment; filename="telemetry_<device_id>_<timestamp>.csv"`

---

### 15. Device Provisioning & Over-the-Air (OTA) Updates

#### `POST /api/v1/devices/{id}/token` *(Protected)*
Regenerates a cryptographically secure device authentication token (`tok_<device_id>_<hex>`).

#### `POST /api/v1/ota/firmware` *(Protected)*
Uploads a new compiled `.bin` firmware binary. Validates SHA-256 checksum and saves to disk.

#### `GET /api/v1/ota/firmware/{filename}`
Serves raw binary files (`application/octet-stream`) for direct ESP32 `httpUpdate.update()` flashing.

#### `POST /api/v1/devices/{id}/ota` *(Protected)*
Dispatches a downlink OTA firmware upgrade command to the target device.

---

### 16. Telemetry Retention & Pruning Engine

Ensures hypertable capacity constraints are enforced without degrading write throughput by limiting total raw records (default 10,000 max).

#### `GET /api/v1/telemetry/stats`
Returns global telemetry storage statistics and current retention limits.

**Response (200 OK):**
```json
{
  "total_records": 3411,
  "max_records": 10000,
  "storage_mode": "timescaledb"
}
```

#### `POST /api/v1/telemetry/prune` *(Protected)*
Triggers on-demand pruning to purge records exceeding the retention threshold.

**Query Parameters:**
- `max_records`: Optional integer to override the retention cap for this prune run.

**Response (200 OK):**
```json
{
  "message": "prune complete",
  "deleted": 150,
  "max_records": 10000
}
```

---

### 17. Distributed Redis Caching & Rate Limiting

The backend uses a dedicated **Redis 7** instance for sub-millisecond data reads, sliding-window IP rate limiting, and session caching.

#### `GET /api/v1/system/cache-stats` *(Protected)*
Returns real-time Redis cache metrics including memory usage, uptime, total keys, hits, misses, and hit ratio.

**Response (200 OK):**
```json
{
  "enabled": true,
  "connected": true,
  "hit_ratio": 94.2,
  "keys_count": 48,
  "memory_used": "1.85M",
  "total_hits": 1284,
  "total_misses": 79,
  "uptime_seconds": 18200
}
```

#### `POST /api/v1/system/cache-flush` *(Protected - Admin Only)*
Purges all distributed Redis cache keys across the platform without affecting persistent database storage.

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Redis cache flushed successfully"
}
```

---

### 18. Google Firebase Cloud Messaging (FCM) HTTP v1 API

Dispatches real-time background push alerts to operators' mobile devices (iOS / Android / Web) using Google Cloud's modern HTTP v1 API (`https://fcm.googleapis.com/v1/projects/{project_id}/messages:send`).

#### `GET /api/v1/notifications/fcm/config` *(Protected)*
Fetches public FCM service status and delivery mode.

**Response (200 OK):**
```json
{
  "configured": true,
  "delivery_mode": "production_google_http_v1",
  "project_id": "iot-platform-production",
  "client_email": "firebase-adminsdk@iot-platform-production.iam.gserviceaccount.com"
}
```

#### `GET /api/v1/notifications/fcm/tokens` *(Protected / Scoped)*
Lists registered mobile and browser push notification tokens for the caller's workspace.

#### `POST /api/v1/notifications/fcm/token` *(Protected)*
Registers a new FCM device token for background push delivery.

**Request Body:**
```json
{
  "token": "eXamPLe_fCm_dEvIcE_tOkEn...",
  "device_name": "Operator iPhone 15 Pro",
  "platform": "iOS"
}
```

#### `DELETE /api/v1/notifications/fcm/token/{id}` *(Protected)*
Unregisters a push token.

#### `POST /api/v1/notifications/fcm/test` *(Protected)*
Dispatches an instant test push notification payload through the Google HTTP v1 pipeline to all registered tokens. Automatic token pruning purges stale tokens if Google responds with `404` or `UNREGISTERED`.

---

## 📡 MQTT Ingestion Pipeline

### Subscribed Topics
1. `devices/+/telemetry` — Standard edge topic where wildcard `+` is the `device_id`.
2. `tenants/+/devices/+/telemetry` — Multi-tenant topic with explicit tenant UUID.
3. `devices/+/status` — Device state events and MQTT Last Will & Testament (LWT) payloads (`online`/`offline`).
4. `tenants/+/devices/+/status` — Multi-tenant device state and LWT topic.
5. `iot/telemetry` — Legacy broadcast topic.

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

### Resilient MQTT Auto-Reconnect Background Worker
Under production container orchestration, the Mosquitto broker container may start slightly after or restart independently from the backend service. Eclipse Paho Go's native `AutoReconnect` only operates *after* an initial connection has been established; if the initial socket connection is refused on cold boot, Paho will not retry in the background.

To guarantee complete zero-maintenance resilience:
1. **Connection State Guard**: [`MQTTService.IsConnected()`](mqtt/subscriber.go) provides thread-safe visibility into the active broker socket status.
2. **Background Reconnection Ticker**: [`main.go`](main.go) executes a non-blocking 5-second ticker goroutine. If the broker was temporarily unreachable at boot or restarted, the worker continuously retries `mqttSvc.Start()` until the connection is established.
3. **Automatic Re-Subscription**: Upon successful connection or reconnection, `OnConnect` triggers automatically, resubscribing to all device telemetry topics (`devices/+/telemetry`, `channels/+/telemetry`, `devices/+/command_ack`).

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

### Running with Docker

Build and run using the multi-stage Docker container:
```bash
# Build from repository root
docker build -f backend/Dockerfile -t iot-backend .

# Run standalone
docker run -p 8080:8080 iot-backend
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
| `MAX_TELEMETRY_RECORDS` | `10000` | Maximum raw telemetry rows retained across the platform before FIFO pruning |
| `TELEMETRY_PRUNE_INTERVAL_SEC` | `30` | Interval in seconds for the background telemetry retention pruning worker |
| `REDIS_ADDR` | `localhost:6379` | Redis host:port connection address |
| `REDIS_PASSWORD` | `""` | Redis connection password (optional) |
| `REDIS_DB` | `0` | Redis database index number |
| `FCM_CREDENTIALS_FILE` | `infra/fcm/service-account.json` | Path to Google Cloud Firebase service account JSON |
| `FCM_SERVICE_ACCOUNT_JSON` | `""` | Inline Google Cloud service account JSON string |
| `FCM_SERVER_KEY` | `""` | Legacy FCM server key (fallback compatibility mode) |
