# IoT Platform Mono-Repo

A modular, multi-tenant IoT platform designed for high-throughput time-series telemetry ingestion, device management, and real-time visualization.

## Repository Structure

```
iot-platform/
├── backend/       # Application server, REST/WebSocket APIs, MQTT ingestion service
├── firmware/      # Edge microcontroller firmware (ESP32, STM32, Arduino)
├── frontend/      # Web dashboard & device management UI
├── infra/         # Docker Compose, TimescaleDB migrations, Mosquitto MQTT broker
└── docs/          # Architecture documentation, API specifications, wiring guides
```

## Getting Started (Infra)

1. Navigate to `infra/`:
   ```bash
   cp .env.example .env
   docker compose up -d
   ```
2. Verify services:
   - **TimescaleDB**: `localhost:5433` (database: `iot_platform`)
   - **Mosquitto MQTT**: `localhost:1883`
