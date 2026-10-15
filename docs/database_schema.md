# Database Schema & Architecture

The IoT Platform uses **PostgreSQL 16** enhanced with **TimescaleDB** for time-series data.

## Tables Overview

| Table | Type | Purpose | Primary Key / Indexing |
|---|---|---|---|
| `tenants` | Relational | Multi-tenancy workspace isolation | `id` (UUID PK), `slug` (Unique) |
| `devices` | Relational | Device registry & provisioning metadata | `id` (UUID PK), `(tenant_id, device_id)` Unique |
| `telemetry` | TimescaleDB Hypertable | High-volume append-only sensor telemetry | Partitioned by `time`. Index on `(tenant_id, device_id, time DESC)` + GIN on `payload` |
| `latest_telemetry` | Relational (Cache) | Most recent snapshot per device for instant dashboard queries | `(tenant_id, device_id)` PK |

## Automated Synchronization
A trigger `trg_update_latest_telemetry` fires `AFTER INSERT ON telemetry`. It upserts into `latest_telemetry` whenever a newer reading arrives, ensuring the dashboard query remains $O(1)$ without doing expensive queries across the hypertable.
