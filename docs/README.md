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
   - Multi-tenant relational schema: 9 persistent tables (`users`, `tenants`, `channels`, `devices`, `device_commands`, `rules`, `alarms`, `notification_channels`, `firmware_packages`).
   - Append-only `telemetry` hypertable with automated chunk partitioning and composite index `idx_telemetry_time_created`.
   - Dual Retention Engine: Global 10,000-record FIFO pruning cap (`MAX_TELEMETRY_RECORDS=10000`) with a 30s background worker plus TimescaleDB 30-day chunk retention.
   - TimescaleDB Continuous Aggregates (`telemetry_1m`, `telemetry_5m`, `telemetry_1h`) preserved through pruning.
   - $O(1)$ `latest_telemetry` snapshot cache table synchronized via atomic SQL triggers.

3. **[Go Backend Service Architecture](../backend/README.md)**
   - REST API specifications (`/health`, `/api/v1/auth/*`, `/api/v1/users`, `/api/v1/tenants`, `/api/v1/channels`, `/api/v1/devices`, `/api/v1/rules`, `/api/v1/alarms`, `/api/v1/telemetry/*`, `/api/v1/notifications/*`, `/api/v1/ota/*`, `/api/v1/system/cache-*`).
   - Distributed Redis L1 cache for sub-millisecond telemetry snapshots, continuous rollups, and IP rate limiting.
   - Google Firebase Cloud Messaging (FCM) HTTP v1 API with RS256 OAuth2 signing and automatic stale token pruning.
   - Role-Based Access Control (RBAC) & Tenant Scoping: User JWT sessions strictly take precedence over static API keys; non-admins are scoped strictly to owned workspaces.
   - Authenticated Server-Sent Events (SSE) streaming with `?token=` query validation and automated 15s keep-alive pings.
   - 10k Telemetry Retention Engine with `GET /api/v1/telemetry/stats` and on-demand `POST /api/v1/telemetry/prune`.
   - 60-Second Inactivity Watchdog automatically marking silent edge nodes `offline`.
   - Downlink device command actuation (`POST /api/v1/devices/{id}/commands`) and OTA binary server.
   - Paho MQTT subscriber & publisher with zero-drop auto-reconnect worker.
   - Resilient in-memory fallback cache maintaining parity when TimescaleDB is offline.
   - 20-test unit test suite (`go test -v ./backend/...`) and GitHub Actions CI workflow.

4. **[Frontend Dashboard & Edge Management UI](../frontend/README.md)**
   - Dedicated initial Login & Registration gate portal (`AuthScreen.jsx`).
   - Automatic role-based routing: Admin Supervisory Monitoring vs. Operator Workspace Cockpit.
   - Auto-scaling Radial Gauges (`MetricGauges.jsx`) with dynamic headroom padding, clean steps, and emerald `[AUTO]` badge.
   - User View Persistence: Card/Gauge toggle and Chart type selections saved across sessions in `localStorage`.
   - Distributed Redis Cache Widget (`RedisCacheWidget.jsx`) displaying live hit ratio, memory usage, and 1-click purge.
   - Mobile Push Notification Manager (`FCMMobileAlerts.jsx`) with live connection badges, device token registration, and simulated push testing.
   - Storage Retention Meter UI badge (`Storage: X / 10,000 (Y%)`) with live capacity color coding and manual "Prune Now" trigger.
   - Authenticated SSE streaming via `?token=` and secure JWT Bearer authorization (hardcoded fallback secrets removed).
   - Real-time device status updates (`device_status` SSE) switching badges between green and offline gray without reload.
   - Two-way Device Control Panel (`DeviceControlPanel.jsx`) for relays, LEDs, sampling intervals, and remote reboot.
   - Outbound Alert Channels manager in `GuardrailsModal.jsx` for Discord, Slack, and generic Webhooks.
   - Dual Y-Axis Chart.js line/area/stepped/bar charts with 1m/5m/1h rollup pills and direct CSV/JSON download buttons.
   - Animated `Live SSE (0ms)` real-time streaming badge with automatic polling fallback.

5. **[ESP32 Edge Firmware & Simulator](../firmware/README.md)**
   - Non-blocking C++ cooperative firmware with dual exponential reconnect backoff (1s to 60s).
   - MQTT Last Will and Testament (LWT) configured on `devices/<id>/status` with retain flag for zero-latency disconnection reporting.
   - Downlink MQTT command execution (`set_relay` GPIO 26, `toggle_led` GPIO 2, `set_interval`, `reboot`, `ota_update`) and ACK publishing.
   - Over-the-Air (OTA) remote firmware flashing via `HTTPUpdate` with pre-flash acknowledgment.
   - Complete parity across PlatformIO (`firmware/esp32-dht22`) and Arduino IDE (`firmware/arduino-ide`).
   - Multi-node Go telemetry simulator (`simulate_nodes.go`) supporting synthetic edge fleets with two-way command ACKs.

6. **[Infrastructure & Containerization](../infra/README.md)**
   - Multi-container orchestration definition for TimescaleDB, Mosquitto, Redis 7, Go Backend, and React Frontend.
   - Google Firebase Cloud Messaging Service Account configuration (`infra/fcm/`).
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

1. **Signed JWT Precedence & Removal of Client Secrets**: Authenticated operations prioritize signed user JWT claims (`Authorization: Bearer <jwt>` or `?token=<jwt>`) over static API keys, preventing privilege escalation. All static fallback keys have been removed from the frontend client.
2. **Strict Workspace Scoping & Tenant Isolation**: Non-admin operators are strictly isolated to workspaces they own (`owner_id = user.id`). Querying or mutating devices, channels, rules, alarms, or telemetry outside the caller's workspaces is rejected with `403 Forbidden`.
3. **Protected SSE Streaming**: Server-Sent Events broker validates JWT tokens passed via query parameter (`?token=`), ensuring unauthorized clients cannot listen to live telemetry, status changes, or alarm broadcasts.
4. **Workspace & Device Deletion Guards**: Non-admin users are blocked from deleting default or system workspaces (`default-org` / `a0000000-0000-0000-0000-000000000001`) or workspaces owned by other accounts. Platform-wide device wipes (`POST /api/v1/devices/reset`) are restricted strictly to administrators.
5. **Per-Device Auth Tokens**: Devices can be provisioned with unique edge security tokens (`tok_<id>_<hex>`) with one-click token rotation in the UI.
6. **Guardrail Safety Policies**: Dynamic threshold rules evaluate incoming sensor metrics during ingestion and automatically dispatch outbound webhook alerts (Slack, Discord, Webhook) on critical violations.
7. **Authoritative Backend**: When a device, channel, or workspace is deleted, the backend database and in-memory caches synchronize immediately, ensuring the dashboard reflects the authoritative state of the hardware.
