-- ==============================================================================
-- IoT Platform - Database Initialization Script
-- Multi-Tenant Time-Series Schema (TimescaleDB + PostgreSQL 16)
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- 2. Tenants Table (Multi-tenancy foundation)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Devices Table (Device registry per tenant)
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    device_type VARCHAR(100) DEFAULT 'generic',
    status VARCHAR(50) NOT NULL DEFAULT 'offline',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_device_id UNIQUE (tenant_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_devices_tenant_id ON devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);

-- 4. Telemetry Table (Time-series hypertable for high-throughput metrics)
CREATE TABLE IF NOT EXISTS telemetry (
    time TIMESTAMPTZ NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Convert telemetry into a TimescaleDB hypertable partitioned by time
SELECT create_hypertable('telemetry', 'time', if_not_exists => TRUE);

-- Composite index for fast tenant + device time-range lookups
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_device_time ON telemetry (tenant_id, device_id, time DESC);

-- GIN index on jsonb payload for flexible querying into sensor fields
CREATE INDEX IF NOT EXISTS idx_telemetry_payload ON telemetry USING GIN (payload);

-- 5. Latest Telemetry Table (State cache for real-time dashboard lookups)
CREATE TABLE IF NOT EXISTS latest_telemetry (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    time TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_latest_telemetry_time ON latest_telemetry(time DESC);

-- 6. Trigger Function: Automatically keep latest_telemetry up to date
CREATE OR REPLACE FUNCTION update_latest_telemetry_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO latest_telemetry (tenant_id, device_id, time, payload, updated_at)
    VALUES (NEW.tenant_id, NEW.device_id, NEW.time, NEW.payload, NOW())
    ON CONFLICT (tenant_id, device_id)
    DO UPDATE SET
        time = CASE 
            WHEN EXCLUDED.time >= latest_telemetry.time THEN EXCLUDED.time 
            ELSE latest_telemetry.time 
        END,
        payload = CASE 
            WHEN EXCLUDED.time >= latest_telemetry.time THEN EXCLUDED.payload 
            ELSE latest_telemetry.payload 
        END,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_latest_telemetry ON telemetry;
CREATE TRIGGER trg_update_latest_telemetry
AFTER INSERT ON telemetry
FOR EACH ROW
EXECUTE FUNCTION update_latest_telemetry_trigger();

-- 7. Seed Sample Tenant & Device for Development
INSERT INTO tenants (id, name, slug, description)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Default Organization',
    'default-org',
    'Default multi-tenant workspace'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO devices (tenant_id, device_id, name, device_type, status, metadata)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'esp32-demo-01',
    'ESP32 Test Node',
    'ESP32',
    'online',
    '{"firmware_version": "1.0.0", "hardware": "ESP32-WROOM-32", "sensors": ["temperature", "humidity", "pressure"]}'::jsonb
)
ON CONFLICT (tenant_id, device_id) DO NOTHING;
