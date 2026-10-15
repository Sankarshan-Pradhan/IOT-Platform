# Backend Service

Handles:
- MQTT ingestion from Mosquitto broker
- Multi-tenant device authentication and registration
- Telemetry persistence into TimescaleDB
- REST & WebSocket APIs for frontend clients

## Running the Service

From repository root:
```bash
go run ./backend
# or
go run backend/main.go
```

From `backend/` directory:
```bash
cd backend
go run main.go
```

## API Endpoints (Day 2)

### 1. Device Registry
- `GET /api/v1/devices` - List all registered devices (supports `?tenant_id=` and `?status=`)

### 2. Telemetry Queries
- `GET /api/v1/devices/{id}/telemetry/latest` - Fetch the latest snapshot for a device (from `latest_telemetry` cache)
- `GET /api/v1/devices/{id}/telemetry/history` - Query historical telemetry from TimescaleDB hypertable
  - Query parameters:
    - `limit`: Max records to return (default: `100`, max: `1000`)
    - `start` / `from`: Start timestamp in RFC3339 format
    - `end` / `to`: End timestamp in RFC3339 format
    - `order`: `DESC` (default) or `ASC`

### 3. Telemetry Ingestion (HTTP POST)
- `POST /api/v1/devices/{id}/telemetry` - Ingest sensor reading directly for device `{id}`:
  ```json
  {
    "temperature": 25.4,
    "humidity": 60.1,
    "pressure": 1012.8
  }
  ```
- `POST /api/v1/telemetry` - Ingest with payload body:
  ```json
  {
    "device_id": "esp32-demo-01",
    "payload": {
      "temperature": 25.4,
      "humidity": 60.1
    }
  }
  ```

## MQTT Subscriber Topics

The backend automatically subscribes to Mosquitto on:
1. `devices/{device_id}/telemetry`
2. `tenants/{tenant_id}/devices/{device_id}/telemetry`
3. `iot/telemetry` (specifying `device_id` in JSON body)

