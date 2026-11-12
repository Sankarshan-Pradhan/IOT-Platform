# 🗄️ Database Schema & Architecture

The IoT Platform uses **PostgreSQL 16** enhanced with **TimescaleDB** for time-series hypertables, continuous aggregate rollups, dynamic threshold guardrails, and multi-tenant workspace isolation.

---

## 📊 Relational & Hypertable Schema Overview

| Table | Type | Purpose | Primary Key / Indexing |
|---|---|---|---|
| `users` | Relational | Operator & Administrator accounts | `id` (PK), `username` (Unique), `email` (Unique) |
| `tenants` | Relational | Multi-tenancy workspace isolation | `id` (UUID PK), `slug` (Unique), `owner_id` (Index) |
| `channels` | Relational | Zone/group telemetry topic partitions | `id` (PK), `tenant_id` (FK Index), `group_name` |
| `devices` | Relational | Device registry & provisioning metadata | `id` (UUID PK), `(tenant_id, device_id)` Unique, `channel_id` (FK) |
| `telemetry` | TimescaleDB Hypertable | High-throughput append-only sensor metrics | Partitioned by `time`. Composite index on `(tenant_id, device_id, time DESC)`, GIN on `payload`, and `(time DESC, created_at DESC)` |
| `latest_telemetry` | Relational (Cache) | Most recent snapshot per device for instant $O(1)$ dashboard lookups | `(tenant_id, device_id)` PK |
| `rules` | Relational | Dynamic threshold guardrail definitions | `id` (PK), `tenant_id` (FK Index), `enabled` |
| `alarms` | Relational | Triggered guardrail alarm lifecycle (`OPEN` / `RESOLVED`) | `id` (PK), `(tenant_id, status)` Index, `triggered_at DESC` Index |
| `device_commands` | Relational | Downlink hardware actuation audit log & ACKs | `id` (PK), `(device_id, sent_at DESC)` Index |
| `notification_channels` | Relational | Outbound alert destinations (Slack, Discord, Webhooks) | `id` (PK), `tenant_id` (Index) |
| `firmware_packages` | Relational | OTA firmware binary packages & SHA-256 checksums | `id` (PK), `version` (Index) |

---

## ⚡ Automated Continuous Aggregates (Rollups)

TimescaleDB automatically aggregates raw telemetry into downsampled historical rollups for instant chart rendering across large time windows:

1. **`telemetry_1m`**: 1-minute time bucket continuous aggregate (min/max/avg temperature & humidity). Refreshed every 1 minute.
2. **`telemetry_5m`**: 5-minute time bucket continuous aggregate. Refreshed every 5 minutes.
3. **`telemetry_1h`**: 1-hour time bucket continuous aggregate. Refreshed every 1 hour.

---

## 🧹 Automated Data Retention & Pruning Policies

1. **30-Day Chunk Retention**: Raw hypertable chunks older than 30 days are automatically dropped by TimescaleDB background workers (`add_retention_policy('telemetry', INTERVAL '30 days')`).
2. **Global 10,000 Record Ceiling**: The database enforces a global row cap of 10,000 records across the entire telemetry table via indexed cutoff boundaries:
   ```sql
   SELECT prune_telemetry_records(10000);
   ```
   Older records exceeding the 10,000 newest records are automatically removed by an asynchronous 30-second background worker without impacting ingestion throughput.

---

## 🔄 Instant State Synchronization
A PostgreSQL trigger `trg_update_latest_telemetry` fires `AFTER INSERT ON telemetry`. It automatically updates `latest_telemetry` whenever a newer reading arrives, ensuring the live dashboard query remains $O(1)$ without scanning the hypertable.
