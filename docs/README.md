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
   - REST API specifications (`/health`, `/devices`, `/telemetry/latest`, `/telemetry/history`).
   - MQTT Paho subscriber architecture and device auto-registration.
   - Resilient in-memory fallback cache with background reconnect goroutines.

4. **[Frontend Dashboard & Edge Management UI](../frontend/README.md)**
   - Real-time 5-second polling engine and countdown timer.
   - Light & Dark mode architecture.
   - Built-in Cryptographic Key Generator & C++ `config.h` builder.
   - Multi-tenant workspace and channel management.

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
+-----------------------------------|-------------------------------------+
                                    |
          +-------------------------+-------------------------+
          | Writes / Ingestion                                | REST Queries (JSON)
          v                                                   v
+-----------------------------------+   +---------------------------------+
|          PERSISTENCE LAYER        |   |        PRESENTATION LAYER       |
|                                   |   |                                 |
|     TimescaleDB (PostgreSQL 16)   |   |   React 18 + Vite Web Dashboard |
|  - telemetry (Hypertable)         |   |   - 5s Polling Engine with Timer|
|  - latest_telemetry (Cache O(1))  |   |   - Light / Dark Mode Toggle    |
|  - tenants, channels, devices     |   |   - Dual Y-Axis Chart.js Charts |
+-----------------------------------+   +---------------------------------+
```

---

## 🔒 Multi-Tenant Security & Provisioning Model

The platform enforces clean organizational isolation at all levels:

1. **Tenant Isolation**: Every device belongs to a specific `tenant_id` (UUID). Telemetry is indexed and queried with `tenant_id` partition keys.
2. **Channel Routing**: Devices stream data on logical channels (e.g. `devices/+/telemetry`), which can be grouped by physical installation bay or monitoring domain.
3. **Cryptographic Credentials**:
   - The frontend Key Generator produces unique Tenant UUIDs, Channel IDs, and Secret Keys (`iot_sec_...`).
   - These are compiled directly into the ESP32 firmware config, guaranteeing that telemetry packets include correct authorization headers.
4. **Authoritative Backend**: When a device registers or is removed, the backend database and in-memory caches synchronize immediately, ensuring the dashboard reflects the real-world state of the hardware.
