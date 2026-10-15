package models

import (
	"encoding/json"
	"time"
)

// Device represents an IoT device in the registry
type Device struct {
	ID         string          `json:"id"`
	TenantID   string          `json:"tenant_id"`
	DeviceID   string          `json:"device_id"`
	Name       string          `json:"name"`
	DeviceType string          `json:"device_type"`
	Status     string          `json:"status"`
	Metadata   json.RawMessage `json:"metadata"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

// TelemetryRecord represents a time-series telemetry row
type TelemetryRecord struct {
	Time      time.Time       `json:"time"`
	TenantID  string          `json:"tenant_id"`
	DeviceID  string          `json:"device_id"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt time.Time       `json:"created_at,omitempty"`
}

// LatestTelemetry represents the cached most recent telemetry snapshot
type LatestTelemetry struct {
	TenantID  string          `json:"tenant_id"`
	DeviceID  string          `json:"device_id"`
	Time      time.Time       `json:"time"`
	Payload   json.RawMessage `json:"payload"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// TelemetryIngestPayload is the incoming payload format for HTTP/MQTT ingestion
type TelemetryIngestPayload struct {
	TenantID string          `json:"tenant_id,omitempty"`
	DeviceID string          `json:"device_id,omitempty"`
	Time     *time.Time      `json:"time,omitempty"`
	Payload  json.RawMessage `json:"payload,omitempty"`
}
