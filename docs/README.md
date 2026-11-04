# 📚 IoT Platform Engineering Documentation

Comprehensive architecture specifications, hardware wiring diagrams, database schemas, and data flow guides for the IoT Platform.

---

## 📑 Available Documentation

1. **[Hardware Wiring & Assembly Guide (ESP32 + DHT22)](esp32_dht22_wiring_guide.md)**
   - Complete breadboard diagrams for 3-pin breakout modules and 4-pin bare DHT22 sensors.
   - ESP32 30-pin & 38-pin DevKit pinout tables.
   - Dual-board deployment details (`esp32-dht22-01` and `esp32-dht22-02`).
   - Pull-up resistor specifications (10kΩ), 3.3V power rails, and hardware troubleshooting.

2. **[Database Schema & Hypertable Design](database_schema.md)**
   - PostgreSQL 16 + TimescaleDB relational schema breakdown.
   - Multi-tenant data model (`tenants`, `channels`, `devices`, `telemetry`, `latest_telemetry`).
   - Append-only `telemetry` hypertable with automatic 7-day chunk partitioning.
   - $O(1)$ `latest_telemetry` snapshot table synchronized via high-performance SQL triggers.

3. **[Go Backend Service Architecture](../backend/README.md)**
   - REST API specifications (`/health`, `/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/users`, `/api/v1/tenants`, `/api/v1/channels`, `/api/v1/devices`, `/api/v1/rules`, `/api/v1/alarms`, `/api/v1/telemetry`).
   - Bcrypt password hashing, JWT session tokens, and backward-compatible `ADMIN_API_KEY` authentication middleware.
   - MQTT Paho subscriber architecture and device auto-registration.
   - Resilient in-memory fallback cache with background reconnect goroutines.
   - Comprehensive unit test suite (`go test ./...`) and GitHub Actions CI workflow.

4. **[Frontend Dashboard & Edge Management UI](../frontend/README.md)**
   - Dedicated initial Login & Registration gate portal (`AuthScreen.jsx`).
   - Automatic role-based routing into two dedicated pages:
     - **Admin Page (`AdminDashboard.jsx`)**: Supervisory Mission Control, Registered Users Directory, cross-user workspaces inspection, and read-only telemetry.
     - **User Page (`UserDashboard.jsx`)**: Personal workspaces, full device CRUD, telemetry routing channels, and safety guardrails.
   - Intuitive top-down navigation hierarchy: Workspaces (Top) → Live Dashboard → Clients & Devices → Groups & Channels.
   - Real-time 5-second polling engine and live countdown ticker.
   - Standardized clean enterprise Light Theme architecture.

5. **[ESP32 Edge Firmware & Simulator](../firmware/README.md)**
   - Non-blocking C++ cooperative firmware.
   - Dual exponential reconnect backoff for WiFi and MQTT.
   - PlatformIO and Arduino IDE setup guides.
   - Multi-node Go telemetry simulator.

---

## 🏛️ End-to-End System Data Flow

```
+-------------------------------------------------------------------------+
|                         EDGE HARDWARE LAYER                             |
|                                                                         |
|   +-----------------------+                 +-----------------------+   |
|   |  ESP32 Node 1 (DHT22) |                 |  ESP32 Node 2 (DHT22) |   |
|   |  Device: node-01      |                 |  Device: node-02      |   |
|   +-----------------------+                 +-----------------------+   |
+-------------------|-------------------------------------|---------------+
                    |                                     |
                    | MQTT Publish (QoS 1, every 5s)      | MQTT Publish (QoS 1, every 5s)
                    | Topic: devices/<id>/telemetry       | Topic: devices/<id>/telemetry
                    v                                     v
+-------------------------------------------------------------------------+
|                       MESSAGING BROKER LAYER                            |
|                                                                         |
|                    Eclipse Mosquitto Broker (:1883)                     |
|         - Manages MQTT Keep-Alives and LWT (Last Will & Testament)      |
+-----------------------------------|-------------------------------------+
                                    |
                                    | High-Throughput MQTT Consumer
                                    v
+-------------------------------------------------------------------------+
|                         APPLICATION SERVER LAYER                        |
|                                                                         |
|                          Go Backend Server (:8080)                      |
|         - Subscribes to devices/+/telemetry                             |
|         - Resolves & Validates Tenant UUID                              |
|         - Auto-Registers new devices with 'online' status               |
|         - In-Memory Fallback Cache if DB is offline                     |
|         - Protected Deletion REST APIs with API Key Auth                |
+-----------------------------------|-------------------------------------+
                                    |
          +-------------------------+-------------------------+
          | Writes / Ingestion                                | REST Queries (JSON)
          v                                                   v
+-----------------------------------+   +---------------------------------+
|          PERSISTENCE LAYER        |   |        PRESENTATION LAYER       |
|                                   |   |                                 |
|     TimescaleDB (PostgreSQL 16)   |   |   React 18 + Vite Web Dashboard |
|  - telemetry (Hypertable)         |   |   - Top: Workspaces Management  |
|  - latest_telemetry (Cache O(1))  |   |   - 5s Polling Engine with Timer|
|  - Cascading Foreign Keys         |   |   - Clean Enterprise Light Theme|
|  - Cascading Foreign Keys         |   |   - Dual Y-Axis Chart.js Charts |
+-----------------------------------+   +---------------------------------+
```

---

## 🔒 Multi-Tenant Security & Provisioning Model

The platform enforces clean organizational isolation at all levels:

1. **Tenant Isolation**: Every device belongs to a specific `tenant_id` (UUID). Telemetry is indexed and queried with `tenant_id` partition keys.
2. **Channel Routing**: Devices stream data on logical channels (e.g. `devices/+/telemetry`), which can be grouped by physical installation bay or monitoring domain.
3. **API Security Middleware**: Deletion and reset operations require `X-API-Key` or `Authorization: Bearer <key>` authentication, protecting production resources from unauthorized purges.
4. **Authoritative Backend**: When a device, channel, or workspace is deleted, the backend database and in-memory caches synchronize immediately, ensuring the dashboard reflects the authoritative state of the hardware.
