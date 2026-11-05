# 📚 IoT Platform Engineering Documentation

Comprehensive architecture specifications, hardware wiring diagrams, database schemas, two-way communication flows, and data pipeline guides for the IoT Platform.

---

## 📑 Available Documentation

1. **[Hardware Wiring & Assembly Guide (ESP32 + DHT22)](esp32_dht22_wiring_guide.md)**
   - Complete breadboard diagrams for 3-pin breakout modules and 4-pin bare DHT22 sensors.
   - AC/DC relay module and status LED connections.
   - Pull-up resistor specifications (10kΩ), 3.3V power rails, and hardware troubleshooting.

2. **[Database Schema & Hypertable Design](database_schema.md)**
   - PostgreSQL 16 + TimescaleDB relational schema breakdown.
   - Multi-tenant data model (`tenants`, `channels`, `devices`, `device_commands`, `telemetry`, `latest_telemetry`).
   - Append-only `telemetry` hypertable with automatic chunk partitioning.
   - TimescaleDB Continuous Aggregates (`telemetry_1m`, `telemetry_5m`, `telemetry_1h`) and 30-day chunk retention policy.
   - $O(1)$ `latest_telemetry` snapshot table synchronized via high-performance SQL triggers.

3. **[Go Backend Service Architecture](../backend/README.md)**
   - REST API specifications (`/health`, `/api/v1/auth/*`, `/api/v1/users`, `/api/v1/tenants`, `/api/v1/channels`, `/api/v1/devices`, `/api/v1/rules`, `/api/v1/alarms`, `/api/v1/notifications/*`, `/api/v1/ota/*`).
   - Downlink device command actuation (`POST /api/v1/devices/{id}/commands`).
   - Real-time Server-Sent Events broker (`GET /api/v1/telemetry/stream`).
   - Downsampling query resolution (`?resolution=raw|1m|5m|1h`) and streaming CSV/JSON export (`/api/v1/devices/{id}/telemetry/export`).
   - Paho MQTT subscriber & command publisher architecture with device auto-registration.
   - Resilient in-memory fallback cache with background reconnect goroutines.
   - 14-test unit test suite (`go test -v ./...`) and GitHub Actions CI workflow.

4. **[Frontend Dashboard & Edge Management UI](../frontend/README.md)**
   - Dedicated initial Login & Registration gate portal (`AuthScreen.jsx`).
   - Automatic role-based routing: Admin Supervisory Monitoring vs. Operator Workspace Cockpit.
   - Two-way Device Control Panel (`DeviceControlPanel.jsx`) for relays, LEDs, sampling intervals, and remote reboot.
   - Outbound Alert Channels manager in `GuardrailsModal.jsx` for Discord, Slack, and generic Webhooks.
   - Dual Y-Axis Chart.js line charts with 1m/5m/1h rollup pills and direct CSV/JSON download buttons.
   - Animated `Live SSE (0ms)` real-time streaming badge with automatic polling fallback.

5. **[ESP32 Edge Firmware & Simulator](../firmware/README.md)**
   - Non-blocking C++ cooperative firmware with dual exponential reconnect backoff.
   - Downlink MQTT command execution (`set_relay`, `toggle_led`, `set_interval`, `reboot`, `ota_update`) and ACK publishing.
   - Over-the-Air (OTA) remote firmware flashing via `HTTPUpdate`.
   - Multi-node Go telemetry simulator with two-way command acknowledgment.

6. **[Infrastructure & Containerization](../infra/README.md)**
   - Multi-container orchestration definition for TimescaleDB, Mosquitto, Go Backend, and React Frontend.
   - Multi-stage Docker builds and Nginx reverse proxy configuration.
   - Single-command startup: `docker compose up --build`.

---

## 🏛️ End-to-End System Data Flow

```
+-------------------------------------------------------------------------+
|                         EDGE HARDWARE LAYER                             |
|                                                                         |
|   +-----------------------+                 +-----------------------+   |
|   |  ESP32 Node 1 (DHT22) |                 |  ESP32 Node 2 (DHT22) |   |
|   |  - Telemetry: 5s rate |                 |  - Relays / LED GPIO  |   |
|   |  - Commands & OTA     |                 |  - Commands & OTA     |   |
|   +-----------|-------^---+                 +-----------|-------^---+   |
+---------------|-------|---------------------------------|-------|-------+
                |       |                                 |       |
  Telemetry (5s)|       | Commands & ACK     Telemetry(5s)|       | Commands & ACK
  Topic:        |       | Topic:             Topic:       |       | Topic:
  devices/...   |       | devices/.../cmd    devices/...  |       | devices/.../cmd
                v       |                                 v       |
+-----------------------|-----------------------------------------|-------+
|                       MESSAGING BROKER LAYER                    |       |
|                                                                 |       |
|                    Eclipse Mosquitto Broker (:1883)             |       |
|         - High-Throughput Pub/Sub Message Routing               |       |
|         - Manages MQTT Keep-Alives and LWT (Last Will & Test)   |       |
+-----------------------|-----------------------------------------|-------+
                        |                                         |
                        | High-Throughput MQTT Consumer & Publisher
                        v
+-------------------------------------------------------------------------+
|                         APPLICATION SERVER LAYER                        |
|                                                                         |
|                          Go Backend Server (:8080)                      |
|         - Subscribes to devices/+/telemetry & devices/+/command_ack     |
|         - Dispatches Downlink Commands (devices/+/commands)             |
|         - Native SSE Broker: Streams Telemetry & Alarms (0ms latency)   |
|         - Outbound Alert Notification Dispatchers (Discord, Slack, Web) |
|         - Dynamic Continuous Rollups (1m, 5m, 1h) & Downsampling        |
|         - Streaming CSV & JSON Data Exporter                            |
|         - OTA Firmware Binary Server & Storage                          |
|         - In-Memory Fallback Cache if DB is offline                     |
+-----------------------------------|-------------------------------------+
                                    |
          +-------------------------+-------------------------+
          | Writes, Rollups & Retentions                      | Real-Time SSE / REST Queries
          v                                                   v
+-----------------------------------+   +---------------------------------+
|          PERSISTENCE LAYER        |   |        PRESENTATION LAYER       |
|                                   |   |                                 |
|     TimescaleDB (PostgreSQL 16)   |   |   React 18 + Vite Web Dashboard |
|  - telemetry (Hypertable)         |   |   - Live SSE 0ms Streaming Badge|
|  - telemetry_1m/5m/1h (Rollups)   |   |   - Device Control Panel        |
|  - 30-Day Chunk Retention Policy  |   |   - Alert Channels Manager      |
|  - latest_telemetry (Cache O(1))  |   |   - Continuous Rollup Selector  |
|  - users, tenants, channels, rules|   |   - CSV & JSON Direct Downloads |
+-----------------------------------+   +---------------------------------+
```

---

## 🔒 Multi-Tenant Security & Provisioning Model

1. **Tenant Isolation**: Every device belongs to a specific `tenant_id` (UUID). Telemetry is indexed and queried with `tenant_id` partition keys.
2. **Per-Device Auth Tokens**: Devices can be provisioned with unique edge security tokens (`tok_<id>_<hex>`) with one-click token rotation in the UI.
3. **Role-Based Access Control**: Standard users exclusively manage their own workspaces; administrators oversee all workspaces and the platform user directory.
4. **Guardrail Safety Policies**: Dynamic threshold rules check sensor metrics during ingestion and automatically dispatch outbound webhook alerts on critical violations.
5. **Authoritative Backend**: When a device, channel, or workspace is deleted, the backend database and in-memory caches synchronize immediately, ensuring the dashboard reflects the authoritative state of the hardware.
