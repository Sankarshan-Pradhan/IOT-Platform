-- ==============================================================================
-- IoT Platform - Database Initialization Script
-- Multi-Tenant Time-Series Schema (TimescaleDB + PostgreSQL 16)
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- 1.5 Users Table (User accounts, profiles & credentials)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    email VARCHAR(128) UNIQUE NOT NULL,
    mobile VARCHAR(32) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Tenants Table (Multi-tenancy foundation)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    owner_id VARCHAR(64),
    owner_name VARCHAR(128),
    owner_email VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_owner_id ON tenants(owner_id);

-- Migration safety: ensure owner columns exist if tenants table was previously created
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'owner_id'
    ) THEN
        ALTER TABLE tenants ADD COLUMN owner_id VARCHAR(64);
        ALTER TABLE tenants ADD COLUMN owner_name VARCHAR(128);
        ALTER TABLE tenants ADD COLUMN owner_email VARCHAR(128);
        CREATE INDEX IF NOT EXISTS idx_tenants_owner_id ON tenants(owner_id);
    END IF;
END $$;

-- 2.1 Channels Table (Logical telemetry groups & MQTT topic partitions)
CREATE TABLE IF NOT EXISTS channels (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    group_name VARCHAR(100) NOT NULL DEFAULT 'General',
    topic VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_tenant_id ON channels(tenant_id);

-- 3. Devices Table (Device registry per tenant linked optionally to channels)
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel_id VARCHAR(100) REFERENCES channels(id) ON DELETE SET NULL,
    device_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    device_type VARCHAR(100) DEFAULT 'generic',
    status VARCHAR(50) NOT NULL DEFAULT 'offline',
    auth_token VARCHAR(128),
    firmware_version VARCHAR(64) DEFAULT 'v1.0.0',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_device_id UNIQUE (tenant_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_devices_tenant_id ON devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_channel_id ON devices(channel_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);

-- Migration safety: ensure channel_id column exists if table was previously created
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'devices' AND column_name = 'channel_id'
    ) THEN
        ALTER TABLE devices ADD COLUMN channel_id VARCHAR(100) REFERENCES channels(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_devices_channel_id ON devices(channel_id);
    END IF;
END $$;

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

-- Composite index for high-speed retention cutoff checks and time-series ordering
CREATE INDEX IF NOT EXISTS idx_telemetry_time_created ON telemetry (time DESC, created_at DESC);

-- 4.1 TimescaleDB Continuous Aggregates (1-Minute, 5-Minute, 1-Hour Rollups)
CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    tenant_id,
    device_id,
    AVG((payload->>'temperature_c')::double precision) AS avg_temperature,
    MIN((payload->>'temperature_c')::double precision) AS min_temperature,
    MAX((payload->>'temperature_c')::double precision) AS max_temperature,
    AVG((payload->>'humidity_pct')::double precision) AS avg_humidity,
    MIN((payload->>'humidity_pct')::double precision) AS min_humidity,
    MAX((payload->>'humidity_pct')::double precision) AS max_humidity,
    AVG((payload->>'wifi_rssi')::double precision) AS avg_wifi_rssi,
    COUNT(*) AS sample_count
FROM telemetry
GROUP BY bucket, tenant_id, device_id
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_5m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('5 minutes', time) AS bucket,
    tenant_id,
    device_id,
    AVG((payload->>'temperature_c')::double precision) AS avg_temperature,
    MIN((payload->>'temperature_c')::double precision) AS min_temperature,
    MAX((payload->>'temperature_c')::double precision) AS max_temperature,
    AVG((payload->>'humidity_pct')::double precision) AS avg_humidity,
    MIN((payload->>'humidity_pct')::double precision) AS min_humidity,
    MAX((payload->>'humidity_pct')::double precision) AS max_humidity,
    AVG((payload->>'wifi_rssi')::double precision) AS avg_wifi_rssi,
    COUNT(*) AS sample_count
FROM telemetry
GROUP BY bucket, tenant_id, device_id
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_1h
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    tenant_id,
    device_id,
    AVG((payload->>'temperature_c')::double precision) AS avg_temperature,
    MIN((payload->>'temperature_c')::double precision) AS min_temperature,
    MAX((payload->>'temperature_c')::double precision) AS max_temperature,
    AVG((payload->>'humidity_pct')::double precision) AS avg_humidity,
    MIN((payload->>'humidity_pct')::double precision) AS min_humidity,
    MAX((payload->>'humidity_pct')::double precision) AS max_humidity,
    AVG((payload->>'wifi_rssi')::double precision) AS avg_wifi_rssi,
    COUNT(*) AS sample_count
FROM telemetry
GROUP BY bucket, tenant_id, device_id
WITH NO DATA;

-- 4.2 Continuous Aggregate Refresh Policies
SELECT add_continuous_aggregate_policy('telemetry_1m',
    start_offset => INTERVAL '1 day',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('telemetry_5m',
    start_offset => INTERVAL '7 days',
    end_offset => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes',
    if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('telemetry_1h',
    start_offset => INTERVAL '30 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE);

-- 4.3 Retention Policy: Drop raw hypertable chunks older than 30 days
SELECT add_retention_policy('telemetry', INTERVAL '30 days', if_not_exists => TRUE);

-- 4.4 Global Telemetry Retention: Automated function to keep at most 10,000 newest records
CREATE OR REPLACE FUNCTION prune_telemetry_records(max_records INTEGER DEFAULT 10000)
RETURNS INTEGER AS $$
DECLARE
    cutoff_time TIMESTAMPTZ;
    cutoff_created TIMESTAMPTZ;
    deleted_count INTEGER := 0;
BEGIN
    SELECT time, created_at INTO cutoff_time, cutoff_created
    FROM telemetry
    ORDER BY time DESC, created_at DESC
    OFFSET max_records - 1
    LIMIT 1;

    IF cutoff_time IS NOT NULL THEN
        WITH deleted AS (
            DELETE FROM telemetry
            WHERE time < cutoff_time 
               OR (time = cutoff_time AND created_at < cutoff_created)
            RETURNING 1
        )
        SELECT COUNT(*) INTO deleted_count FROM deleted;
    END IF;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

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

-- 6.5 Seed Default Admin User (Password: admin123)
INSERT INTO users (id, username, name, email, mobile, password_hash, role)
VALUES (
    'usr-admin-system-001',
    'admin',
    'System Administrator',
    'admin@iot-platform.local',
    '+1-555-0100',
    -- standard bcrypt hash for "admin123"
    '$2a$10$tZ26fJm69D6iN4mNfE63/eT619P9aQ5fB016d9R9uS9q1p4yH7F3O',
    'admin'
)
ON CONFLICT (username) DO NOTHING;

-- 7. Seed Default Tenant
INSERT INTO tenants (id, name, slug, description, owner_id, owner_name, owner_email)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Default Organization',
    'default-org',
    'Default multi-tenant workspace with TimescaleDB hypertable isolation.',
    'usr-admin-system-001',
    'System Administrator',
    'admin@iot-platform.local'
)
ON CONFLICT (slug) DO NOTHING;

-- 8. Seed Default Channels
INSERT INTO channels (id, tenant_id, name, group_name, topic, description)
VALUES 
(
    'chan-dht22-alpha',
    'a0000000-0000-0000-0000-000000000001',
    'Laboratory Environmental Sensors',
    'Environmental Monitoring',
    'devices/+/telemetry',
    'DHT22 sensors streaming temperature and humidity every 5s.'
),
(
    'chan-hvac-zone1',
    'a0000000-0000-0000-0000-000000000001',
    'Server Room HVAC Control',
    'Server Room HVAC',
    'channels/chan-hvac-zone1/telemetry',
    'Critical cooling and humidity threshold telemetry.'
)
ON CONFLICT (id) DO NOTHING;

-- 9. Rules Table (Dynamic threshold guardrails)
CREATE TABLE IF NOT EXISTS rules (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    device_id VARCHAR(100),
    field VARCHAR(100) NOT NULL,
    operator VARCHAR(10) NOT NULL,
    threshold DOUBLE PRECISION NOT NULL,
    severity VARCHAR(50) NOT NULL DEFAULT 'CRITICAL',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rules_tenant_id ON rules(tenant_id);

-- 10. Alarms Table (Triggered guardrail alarm events)
CREATE TABLE IF NOT EXISTS alarms (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rule_id VARCHAR(100) REFERENCES rules(id) ON DELETE SET NULL,
    device_id VARCHAR(100) NOT NULL,
    rule_name VARCHAR(255) NOT NULL,
    severity VARCHAR(50) NOT NULL DEFAULT 'CRITICAL',
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    trigger_value DOUBLE PRECISION NOT NULL,
    threshold DOUBLE PRECISION NOT NULL,
    message TEXT NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alarms_tenant_status ON alarms(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_alarms_triggered_at ON alarms(triggered_at DESC);

-- Seed Default Overheat Guardrail Rule (temperature_c > 35.0)
INSERT INTO rules (id, tenant_id, name, description, field, operator, threshold, severity, enabled)
VALUES (
    'rule-temp-overheat',
    'a0000000-0000-0000-0000-000000000001',
    'High Temperature Overheat Guardrail',
    'Triggers an OPEN alarm when ambient temperature exceeds 35.0°C safety threshold.',
    'temperature_c',
    '>',
    35.0,
    'CRITICAL',
    TRUE
)
ON CONFLICT (id) DO NOTHING;

-- 11. Notification Channels Table (Slack, Discord, generic Webhooks)
CREATE TABLE IF NOT EXISTS notification_channels (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'webhook',
    target_url TEXT NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'CRITICAL',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_channels_tenant ON notification_channels(tenant_id);

-- 12. Firmware Packages Table (OTA Firmware Binaries)
CREATE TABLE IF NOT EXISTS firmware_packages (
    id VARCHAR(64) PRIMARY KEY,
    version VARCHAR(64) NOT NULL,
    device_type VARCHAR(64) NOT NULL DEFAULT 'ESP32',
    filename VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum_sha VARCHAR(128) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_firmware_version ON firmware_packages(version);

-- 13. Firebase Cloud Messaging (FCM) Device Tokens & Mobile Alert Subscriptions
CREATE TABLE IF NOT EXISTS fcm_tokens (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64),
    device_name VARCHAR(128) NOT NULL,
    fcm_token TEXT NOT NULL UNIQUE,
    platform VARCHAR(32) NOT NULL DEFAULT 'web', -- 'android', 'ios', 'web'
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_tenant ON fcm_tokens(tenant_id);

