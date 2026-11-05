package models

import (
	"encoding/json"
	"time"
)

// Tenant represents an organizational workspace
type Tenant struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	Description string    `json:"description,omitempty"`
	OwnerID     string    `json:"owner_id,omitempty"`
	OwnerName   string    `json:"owner_name,omitempty"`
	OwnerEmail  string    `json:"owner_email,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Channel represents a logical telemetry group or topic partition within a tenant
type Channel struct {
	ID           string    `json:"id"`
	TenantID     string    `json:"tenant_id"`
	Name         string    `json:"name"`
	Group        string    `json:"group"`
	Topic        string    `json:"topic"`
	Description  string    `json:"description,omitempty"`
	DevicesCount int       `json:"devices_count"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Device represents an IoT device in the registry
type Device struct {
	ID              string          `json:"id"`
	TenantID        string          `json:"tenant_id"`
	ChannelID       string          `json:"channel_id,omitempty"`
	DeviceID        string          `json:"device_id"`
	Name            string          `json:"name"`
	DeviceType      string          `json:"device_type"`
	Status          string          `json:"status"`
	AuthToken       string          `json:"auth_token,omitempty"`
	FirmwareVersion string          `json:"firmware_version,omitempty"`
	Metadata        json.RawMessage `json:"metadata"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// Firmware represents an OTA firmware binary package for remote flashing
type Firmware struct {
	ID          string    `json:"id"`
	Version     string    `json:"version"`
	DeviceType  string    `json:"device_type"`
	Filename    string    `json:"filename"`
	SizeBytes   int64     `json:"size_bytes"`
	ChecksumSHA string    `json:"checksum_sha"`
	Description string    `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
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
	TenantID  string          `json:"tenant_id,omitempty"`
	ChannelID string          `json:"channel_id,omitempty"`
	DeviceID  string          `json:"device_id,omitempty"`
	Time      *time.Time      `json:"time,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

// Rule defines a dynamic threshold guardrail
type Rule struct {
	ID          string    `json:"id"`
	TenantID    string    `json:"tenant_id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	DeviceID    string    `json:"device_id,omitempty"`
	Field       string    `json:"field"`
	Operator    string    `json:"operator"` // ">", ">=", "<", "<=", "==", "!="
	Threshold   float64   `json:"threshold"`
	Severity    string    `json:"severity"` // "CRITICAL", "WARNING", "INFO"
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Alarm represents an alarm triggered by a rule violation
type Alarm struct {
	ID           string     `json:"id"`
	TenantID     string     `json:"tenant_id"`
	RuleID       string     `json:"rule_id,omitempty"`
	DeviceID     string     `json:"device_id"`
	RuleName     string     `json:"rule_name"`
	Severity     string     `json:"severity"`
	Status       string     `json:"status"` // "OPEN", "ACKNOWLEDGED", "RESOLVED"
	TriggerValue float64    `json:"trigger_value"`
	Threshold    float64    `json:"threshold"`
	Message      string     `json:"message"`
	TriggeredAt  time.Time  `json:"triggered_at"`
	ResolvedAt   *time.Time `json:"resolved_at,omitempty"`
}

// User represents an authenticated platform user (or administrator)
type User struct {
	ID              string    `json:"id"`
	Username        string    `json:"username"`
	Name            string    `json:"name"`
	Email           string    `json:"email"`
	Mobile          string    `json:"mobile"`
	PasswordHash    string    `json:"-"`
	Role            string    `json:"role"` // "admin" or "user"
	WorkspacesCount int       `json:"workspaces_count,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// RegisterRequest payload for POST /api/v1/auth/register
type RegisterRequest struct {
	Name     string `json:"name"`
	Mobile   string `json:"mobile"`
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginRequest payload for POST /api/v1/auth/login
type LoginRequest struct {
	Username string `json:"username"` // Accepts username or email
	Password string `json:"password"`
}

// LoginResponse response for POST /api/v1/auth/login and register
type LoginResponse struct {
	Status    string    `json:"status"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	User      User      `json:"user"`
}

// JWTClaims represents claims inside standard HS256 JWT
type JWTClaims struct {
	Sub      string `json:"sub"` // User ID or username
	UserID   string `json:"user_id,omitempty"`
	Username string `json:"username,omitempty"`
	Name     string `json:"name,omitempty"`
	Email    string `json:"email,omitempty"`
	Role     string `json:"role"`
	TenantID string `json:"tenant_id,omitempty"`
	Exp      int64  `json:"exp"`
	Iat      int64  `json:"iat"`
}

// DeviceCommand represents a downlink actuation command dispatched to a hardware device
type DeviceCommand struct {
	ID        string          `json:"id"`
	DeviceID  string          `json:"device_id"`
	TenantID  string          `json:"tenant_id,omitempty"`
	Action    string          `json:"action"` // e.g., "set_relay", "toggle_led", "set_interval", "reboot", "calibrate"
	Payload   json.RawMessage `json:"payload,omitempty"`
	Status    string          `json:"status"` // "PENDING", "SENT", "ACKNOWLEDGED", "FAILED"
	Response  string          `json:"response,omitempty"`
	SentAt    time.Time       `json:"sent_at"`
	AckAt     *time.Time      `json:"ack_at,omitempty"`
}
