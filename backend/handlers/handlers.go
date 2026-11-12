package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"iot-backend/backend/models"

	"golang.org/x/crypto/bcrypt"
)

// MQTTPublisher allows decoupled publishing of downlink commands via MQTT
type MQTTPublisher interface {
	PublishCommand(deviceID string, cmdPayload []byte) error
}

type APIHandler struct {
	DB            *sql.DB
	AdminAPIKey   string
	JWTSecret     string
	AdminUsername string
	AdminPassword string
	mu            sync.RWMutex
	memTenants    map[string]models.Tenant
	memChannels   map[string]models.Channel
	memDevices    map[string]models.Device
	memLatest     map[string]models.LatestTelemetry
	memHistory    map[string][]models.TelemetryRecord
	memRules      map[string]models.Rule
	memAlarms     map[string]models.Alarm
	memUsers      map[string]models.User
	memCommands   map[string]models.DeviceCommand
	mqttPub       MQTTPublisher
	sseBroker     *SSEBroker
	memNotificationChannels map[string]NotificationChannel
	memFirmwares  map[string]models.Firmware
	maxTelemetryRecords     int
	pruneIntervalSec        int
	loginLimiter            *ipRateLimiter
}

type ipRateLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
	limit    int
	window   time.Duration
}

func newIPRateLimiter(limit int, window time.Duration) *ipRateLimiter {
	return &ipRateLimiter{
		attempts: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
}

func (rl *ipRateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-rl.window)

	valid := make([]time.Time, 0, len(rl.attempts[ip]))
	for _, t := range rl.attempts[ip] {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= rl.limit {
		rl.attempts[ip] = valid
		return false
	}

	rl.attempts[ip] = append(valid, now)
	return true
}

func getClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	ip := r.RemoteAddr
	if host, _, err := net.SplitHostPort(ip); err == nil {
		return host
	}
	return ip
}

func NewAPIHandler(db *sql.DB, adminAPIKey string) *APIHandler {
	now := time.Now().UTC()

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "iot_jwt_super_secret_key_2026"
	}
	adminUser := os.Getenv("ADMIN_USERNAME")
	if adminUser == "" {
		adminUser = "admin"
	}
	adminPass := os.Getenv("ADMIN_PASSWORD")
	if adminPass == "" {
		adminPass = "admin123"
	}

	adminHash, _ := bcrypt.GenerateFromPassword([]byte(adminPass), bcrypt.DefaultCost)
	adminUserObj := models.User{
		ID:           "usr-admin-system-001",
		Username:     adminUser,
		Name:         "System Administrator",
		Email:        "admin@iot-platform.local",
		Mobile:       "+1-555-0100",
		PasswordHash: string(adminHash),
		Role:         "admin",
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	h := &APIHandler{
		DB:            db,
		AdminAPIKey:   adminAPIKey,
		JWTSecret:     jwtSecret,
		AdminUsername: adminUser,
		AdminPassword: adminPass,
		memTenants: map[string]models.Tenant{
			"a0000000-0000-0000-0000-000000000001": {
				ID:          "a0000000-0000-0000-0000-000000000001",
				Name:        "Default Organization",
				Slug:        "default-org",
				Description: "Default multi-tenant workspace with TimescaleDB hypertable isolation.",
				OwnerID:     "usr-admin-system-001",
				OwnerName:   "System Administrator",
				OwnerEmail:  "admin@iot-platform.local",
				CreatedAt:   now,
				UpdatedAt:   now,
			},
		},
		memChannels: map[string]models.Channel{
			"chan-dht22-alpha": {
				ID:          "chan-dht22-alpha",
				TenantID:    "a0000000-0000-0000-0000-000000000001",
				Name:        "Laboratory Environmental Sensors",
				Group:       "Environmental Monitoring",
				Topic:       "devices/+/telemetry",
				Description: "DHT22 sensors streaming temperature and humidity every 5s.",
				CreatedAt:   now,
				UpdatedAt:   now,
			},
			"chan-hvac-zone1": {
				ID:          "chan-hvac-zone1",
				TenantID:    "a0000000-0000-0000-0000-000000000001",
				Name:        "Server Room HVAC Control",
				Group:       "Server Room HVAC",
				Topic:       "channels/chan-hvac-zone1/telemetry",
				Description: "Critical cooling and humidity threshold telemetry.",
				CreatedAt:   now,
				UpdatedAt:   now,
			},
		},
		memDevices: make(map[string]models.Device),
		memLatest:  make(map[string]models.LatestTelemetry),
		memHistory: make(map[string][]models.TelemetryRecord),
		memRules: map[string]models.Rule{
			"rule-temp-overheat": {
				ID:          "rule-temp-overheat",
				TenantID:    "a0000000-0000-0000-0000-000000000001",
				Name:        "High Temperature Overheat Guardrail",
				Description: "Triggers an OPEN alarm when ambient temperature exceeds 35.0°C safety threshold.",
				Field:       "temperature_c",
				Operator:    ">",
				Threshold:   35.0,
				Severity:    "CRITICAL",
				Enabled:     true,
				CreatedAt:   now,
				UpdatedAt:   now,
			},
		},
		memAlarms: make(map[string]models.Alarm),
		memUsers: map[string]models.User{
			"usr-admin-system-001": adminUserObj,
		},
		memCommands: make(map[string]models.DeviceCommand),
		sseBroker:   NewSSEBroker(),
		memNotificationChannels: make(map[string]NotificationChannel),
		memFirmwares:            make(map[string]models.Firmware),
		maxTelemetryRecords:     10000,
		pruneIntervalSec:        30,
		loginLimiter:            newIPRateLimiter(20, 1*time.Minute),
	}

	if envMax := os.Getenv("MAX_TELEMETRY_RECORDS"); envMax != "" {
		if parsed, err := strconv.Atoi(envMax); err == nil && parsed > 0 {
			h.maxTelemetryRecords = parsed
		}
	}
	if envInterval := os.Getenv("TELEMETRY_PRUNE_INTERVAL_SEC"); envInterval != "" {
		if parsed, err := strconv.Atoi(envInterval); err == nil && parsed > 0 {
			h.pruneIntervalSec = parsed
		}
	}

	if db != nil {
		h.ensureSchemaMigrations()
	}

	return h
}

func (h *APIHandler) SetMQTTPublisher(pub MQTTPublisher) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.mqttPub = pub
}

func (h *APIHandler) ensureSchemaMigrations() {
	if h.DB == nil {
		return
	}
	_, _ = h.DB.Exec(`
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

		CREATE TABLE IF NOT EXISTS device_commands (
			id VARCHAR(64) PRIMARY KEY,
			device_id VARCHAR(64) NOT NULL,
			tenant_id VARCHAR(64),
			action VARCHAR(64) NOT NULL,
			payload JSONB,
			status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
			response TEXT,
			sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			ack_at TIMESTAMPTZ
		);
		CREATE INDEX IF NOT EXISTS idx_commands_device ON device_commands(device_id, sent_at DESC);

		ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_id VARCHAR(64);
		ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_name VARCHAR(128);
		ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_email VARCHAR(128);

		ALTER TABLE devices ADD COLUMN IF NOT EXISTS auth_token VARCHAR(128);
		ALTER TABLE devices ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(64) DEFAULT 'v1.0.0';

		CREATE INDEX IF NOT EXISTS idx_telemetry_time_created ON telemetry (time DESC, created_at DESC);

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
	`)

	adminHash, _ := bcrypt.GenerateFromPassword([]byte(h.AdminPassword), bcrypt.DefaultCost)
	_, _ = h.DB.Exec(`
		INSERT INTO users (id, username, name, email, mobile, password_hash, role)
		VALUES ('usr-admin-system-001', $1, 'System Administrator', 'admin@iot-platform.local', '+1-555-0100', $2, 'admin')
		ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin';

		UPDATE tenants SET owner_id = 'usr-admin-system-001', owner_name = 'System Administrator', owner_email = 'admin@iot-platform.local'
		WHERE id = 'a0000000-0000-0000-0000-000000000001' AND (owner_id IS NULL OR owner_id = '');
	`, h.AdminUsername, string(adminHash))
}

func (h *APIHandler) SetDB(db *sql.DB) {
	h.mu.Lock()
	h.DB = db
	h.mu.Unlock()
	h.ensureSchemaMigrations()
}

func (h *APIHandler) isDBReady() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.DB != nil && h.DB.Ping() == nil
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// GenerateJWT creates a standard HMAC-SHA256 (HS256) JWT signed with JWTSecret.
func (h *APIHandler) GenerateJWT(user models.User, tenantID string, duration time.Duration) (string, time.Time, error) {
	now := time.Now().UTC()
	exp := now.Add(duration)

	headerJSON := `{"alg":"HS256","typ":"JWT"}`
	headerB64 := base64.RawURLEncoding.EncodeToString([]byte(headerJSON))

	claims := models.JWTClaims{
		Sub:      user.ID,
		UserID:   user.ID,
		Username: user.Username,
		Name:     user.Name,
		Email:    user.Email,
		Role:     user.Role,
		TenantID: tenantID,
		Exp:      exp.Unix(),
		Iat:      now.Unix(),
	}
	claimsBytes, err := json.Marshal(claims)
	if err != nil {
		return "", exp, err
	}
	claimsB64 := base64.RawURLEncoding.EncodeToString(claimsBytes)

	signingInput := headerB64 + "." + claimsB64
	mac := hmac.New(sha256.New, []byte(h.JWTSecret))
	mac.Write([]byte(signingInput))
	sigB64 := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return signingInput + "." + sigB64, exp, nil
}

// ValidateJWT verifies signature and expiration of a standard HS256 JWT.
func (h *APIHandler) ValidateJWT(tokenStr string) (*models.JWTClaims, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid token format")
	}

	signingInput := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, []byte(h.JWTSecret))
	mac.Write([]byte(signingInput))
	expectedSig := mac.Sum(nil)

	actualSig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("invalid signature encoding")
	}

	if !hmac.Equal(actualSig, expectedSig) {
		return nil, fmt.Errorf("invalid signature")
	}

	claimsBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid claims encoding")
	}

	var claims models.JWTClaims
	if err := json.Unmarshal(claimsBytes, &claims); err != nil {
		return nil, fmt.Errorf("invalid claims json")
	}

	if time.Now().UTC().Unix() > claims.Exp {
		return nil, fmt.Errorf("token expired")
	}

	return &claims, nil
}

// getCaller extracts authenticated user claims from the incoming request.
// User JWT credentials take strict precedence over any static API key.
func (h *APIHandler) getCaller(r *http.Request) *models.JWTClaims {
	// 1. Check Authorization header first (Bearer <token>)
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		rawToken := strings.TrimSpace(authHeader)
		if strings.HasPrefix(rawToken, "Bearer ") {
			rawToken = strings.TrimSpace(strings.TrimPrefix(rawToken, "Bearer "))
		}
		if claims, err := h.ValidateJWT(rawToken); err == nil && claims != nil {
			return claims
		}
		// Allow Admin API Key via Bearer header as well
		if h.AdminAPIKey != "" && rawToken == h.AdminAPIKey {
			return &models.JWTClaims{
				Sub:      "usr-admin-system-001",
				UserID:   "usr-admin-system-001",
				Username: h.AdminUsername,
				Name:     "System Administrator",
				Role:     "admin",
			}
		}
	}

	// 2. Check X-API-Key header second
	apiKey := strings.TrimSpace(r.Header.Get("X-API-Key"))
	if apiKey != "" {
		if claims, err := h.ValidateJWT(apiKey); err == nil && claims != nil {
			return claims
		}
		if h.AdminAPIKey != "" && apiKey == h.AdminAPIKey {
			return &models.JWTClaims{
				Sub:      "usr-admin-system-001",
				UserID:   "usr-admin-system-001",
				Username: h.AdminUsername,
				Name:     "System Administrator",
				Role:     "admin",
			}
		}
	}

	// 3. Check query parameters (?token=... or ?api_key=... for SSE EventSource)
	qToken := strings.TrimSpace(r.URL.Query().Get("token"))
	if qToken != "" {
		if claims, err := h.ValidateJWT(qToken); err == nil && claims != nil {
			return claims
		}
	}
	qKey := strings.TrimSpace(r.URL.Query().Get("api_key"))
	if qKey != "" && h.AdminAPIKey != "" && qKey == h.AdminAPIKey {
		return &models.JWTClaims{
			Sub:      "usr-admin-system-001",
			UserID:   "usr-admin-system-001",
			Username: h.AdminUsername,
			Name:     "System Administrator",
			Role:     "admin",
		}
	}

	return nil
}

// AuthMiddleware protects management endpoints using either a signed JWT Token or an API Key.
func (h *APIHandler) AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := h.getCaller(r)
		if caller == nil {
			writeError(w, http.StatusUnauthorized, "Unauthorized: authentication required (JWT token or API key)")
			return
		}
		next(w, r)
	}
}

// userOwnsTenant checks whether the authenticated caller has ownership of the given tenant workspace.
func (h *APIHandler) userOwnsTenant(caller *models.JWTClaims, tenantID string) bool {
	if caller == nil || tenantID == "" {
		return false
	}
	if caller.Role == "admin" {
		return true
	}
	if h.isDBReady() {
		var ownerID, ownerEmail string
		err := h.DB.QueryRow(
			"SELECT COALESCE(owner_id, ''), COALESCE(owner_email, '') FROM tenants WHERE id::text = $1 OR slug = $1",
			tenantID,
		).Scan(&ownerID, &ownerEmail)
		if err == nil {
			if (ownerID == caller.UserID || ownerID == caller.Username) && ownerID != "" {
				return true
			}
			if caller.Email != "" && ownerEmail == caller.Email {
				return true
			}
		}
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for tid, t := range h.memTenants {
		if tid == tenantID || t.Slug == tenantID {
			if (t.OwnerID == caller.UserID || t.OwnerID == caller.Username) && t.OwnerID != "" {
				return true
			}
			if caller.Email != "" && t.OwnerEmail == caller.Email {
				return true
			}
		}
	}
	return false
}

// getUserTenantIDs returns all tenant IDs accessible to the caller.
func (h *APIHandler) getUserTenantIDs(caller *models.JWTClaims) []string {
	if caller == nil {
		return nil
	}
	ids := make([]string, 0)
	if h.isDBReady() {
		rows, err := h.DB.Query(
			"SELECT id::text FROM tenants WHERE owner_id = $1 OR owner_id = $2 OR (owner_email != '' AND owner_email = $3)",
			caller.UserID, caller.Username, caller.Email,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var tid string
				if err := rows.Scan(&tid); err == nil && tid != "" {
					ids = append(ids, tid)
				}
			}
			return ids
		}
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for tid, t := range h.memTenants {
		if (t.OwnerID == caller.UserID || t.OwnerID == caller.Username || (caller.Email != "" && t.OwnerEmail == caller.Email)) && t.OwnerID != "" {
			ids = append(ids, tid)
		}
	}
	return ids
}

// resolveDevice finds a device by either internal UUID or business device_id
func (h *APIHandler) resolveDevice(identifier string) (*models.Device, error) {
	if h.isDBReady() {
		query := `
			SELECT id, tenant_id, COALESCE(channel_id::text, ''), device_id, name, device_type, status, metadata, created_at, updated_at
			FROM devices
			WHERE id::text = $1 OR device_id = $1
			LIMIT 1;
		`
		var d models.Device
		var metadataBytes []byte

		err := h.DB.QueryRow(query, identifier).Scan(
			&d.ID, &d.TenantID, &d.ChannelID, &d.DeviceID, &d.Name, &d.DeviceType, &d.Status,
			&metadataBytes, &d.CreatedAt, &d.UpdatedAt,
		)
		if err == nil {
			d.Metadata = json.RawMessage(metadataBytes)
			return &d, nil
		}

		// Fallback query without channel_id in case column does not exist yet
		fallbackQuery := `
			SELECT id, tenant_id, device_id, name, device_type, status, metadata, created_at, updated_at
			FROM devices
			WHERE id::text = $1 OR device_id = $1
			LIMIT 1;
		`
		err = h.DB.QueryRow(fallbackQuery, identifier).Scan(
			&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.DeviceType, &d.Status,
			&metadataBytes, &d.CreatedAt, &d.UpdatedAt,
		)
		if err == nil {
			d.Metadata = json.RawMessage(metadataBytes)
			return &d, nil
		}
	}

	// In-memory fallback
	h.mu.RLock()
	defer h.mu.RUnlock()
	if d, ok := h.memDevices[identifier]; ok {
		return &d, nil
	}

	return nil, sql.ErrNoRows
}

// GetTenants handles GET /api/v1/tenants
// Admin sees ALL workspaces across all users (or filters by owner_id/user_id); regular users only see their own workspaces.
func (h *APIHandler) GetTenants(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized: authentication required to view workspaces")
		return
	}

	isAdmin := caller.Role == "admin"
	callerID := caller.UserID
	callerUsername := caller.Username
	callerEmail := caller.Email

	filterOwner := strings.TrimSpace(r.URL.Query().Get("owner_id"))
	if filterOwner == "" {
		filterOwner = strings.TrimSpace(r.URL.Query().Get("user_id"))
	}

	if h.isDBReady() {
		var query string
		var rows *sql.Rows
		var err error

		if isAdmin {
			if filterOwner != "" {
				query = `
					SELECT id, name, slug, COALESCE(description, ''), 
					       COALESCE(owner_id, ''), COALESCE(owner_name, ''), COALESCE(owner_email, ''),
					       created_at, updated_at 
					FROM tenants 
					WHERE owner_id = $1 OR owner_id = $2 OR owner_name = $1 OR owner_email = $1
					ORDER BY created_at ASC;
				`
				rows, err = h.DB.Query(query, filterOwner, filterOwner)
			} else {
				query = `
					SELECT id, name, slug, COALESCE(description, ''), 
					       COALESCE(owner_id, ''), COALESCE(owner_name, ''), COALESCE(owner_email, ''),
					       created_at, updated_at 
					FROM tenants 
					ORDER BY created_at ASC;
				`
				rows, err = h.DB.Query(query)
			}
		} else {
			// Regular user: strictly restrict to caller's own identity
			query = `
				SELECT id, name, slug, COALESCE(description, ''), 
				       COALESCE(owner_id, ''), COALESCE(owner_name, ''), COALESCE(owner_email, ''),
				       created_at, updated_at 
				FROM tenants 
				WHERE owner_id = $1 OR owner_id = $2 OR (owner_email != '' AND owner_email = $3)
				ORDER BY created_at ASC;
			`
			rows, err = h.DB.Query(query, callerID, callerUsername, callerEmail)
		}

		if err == nil {
			defer rows.Close()
			tenants := make([]models.Tenant, 0)
			for rows.Next() {
				var t models.Tenant
				if err := rows.Scan(&t.ID, &t.Name, &t.Slug, &t.Description, &t.OwnerID, &t.OwnerName, &t.OwnerEmail, &t.CreatedAt, &t.UpdatedAt); err == nil {
					tenants = append(tenants, t)
				}
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"count":   len(tenants),
				"tenants": tenants,
			})
			return
		}
		log.Printf("[Warning] Database query for tenants failed, using in-memory: %v", err)
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	tenants := make([]models.Tenant, 0)
	for _, t := range h.memTenants {
		if isAdmin {
			if filterOwner != "" {
				if t.OwnerID == filterOwner || t.OwnerName == filterOwner || t.OwnerEmail == filterOwner {
					tenants = append(tenants, t)
				}
			} else {
				tenants = append(tenants, t)
			}
		} else {
			if t.OwnerID == callerID || t.OwnerID == callerUsername || (callerEmail != "" && t.OwnerEmail == callerEmail) {
				tenants = append(tenants, t)
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":   len(tenants),
		"tenants": tenants,
	})
}

// CreateTenant handles POST /api/v1/tenants
func (h *APIHandler) CreateTenant(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized: authentication required to create a workspace")
		return
	}
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil || len(bodyBytes) == 0 {
		writeError(w, http.StatusBadRequest, "Invalid or empty request body")
		return
	}
	defer r.Body.Close()

	var t models.Tenant
	if err := json.Unmarshal(bodyBytes, &t); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if strings.TrimSpace(t.Name) == "" {
		writeError(w, http.StatusBadRequest, "'name' is required")
		return
	}

	if t.ID == "" {
		b := make([]byte, 16)
		_, _ = rand.Read(b)
		b[6] = (b[6] & 0x0f) | 0x40 // Version 4
		b[8] = (b[8] & 0x3f) | 0x80 // Variant 10
		t.ID = fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
	}

	if t.Slug == "" {
		t.Slug = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(t.Name), " ", "-"))
	}

	if caller.Role == "admin" && t.OwnerID != "" {
		// Keep specified OwnerID if administrator is creating on behalf of a user
		if t.OwnerName == "" {
			t.OwnerName = caller.Name
		}
		if t.OwnerEmail == "" {
			t.OwnerEmail = caller.Email
		}
	} else {
		t.OwnerID = caller.UserID
		t.OwnerName = caller.Name
		if t.OwnerName == "" {
			t.OwnerName = caller.Username
		}
		t.OwnerEmail = caller.Email
	}

	t.CreatedAt = time.Now().UTC()
	t.UpdatedAt = time.Now().UTC()

	h.mu.Lock()
	h.memTenants[t.ID] = t
	h.mu.Unlock()

	if h.isDBReady() {
		query := `
			INSERT INTO tenants (id, name, slug, description, owner_id, owner_name, owner_email, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (id) DO UPDATE SET 
				name = EXCLUDED.name, 
				description = EXCLUDED.description, 
				owner_id = EXCLUDED.owner_id,
				owner_name = EXCLUDED.owner_name,
				owner_email = EXCLUDED.owner_email,
				updated_at = NOW()
			RETURNING id, name, slug, COALESCE(description, ''), COALESCE(owner_id, ''), COALESCE(owner_name, ''), COALESCE(owner_email, ''), created_at, updated_at;
		`
		var dbT models.Tenant
		err := h.DB.QueryRow(query, t.ID, t.Name, t.Slug, t.Description, t.OwnerID, t.OwnerName, t.OwnerEmail, t.CreatedAt, t.UpdatedAt).Scan(
			&dbT.ID, &dbT.Name, &dbT.Slug, &dbT.Description, &dbT.OwnerID, &dbT.OwnerName, &dbT.OwnerEmail, &dbT.CreatedAt, &dbT.UpdatedAt,
		)
		if err == nil {
			t = dbT
		}
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"status": "success",
		"tenant": t,
	})
}

// DeleteTenant handles DELETE /api/v1/tenants/{id}
func (h *APIHandler) DeleteTenant(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized: authentication required")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Tenant ID is required in URL path")
		return
	}

	// Permission guard: regular users can only delete their own workspaces
	if caller.Role != "admin" {
		if id == "a0000000-0000-0000-0000-000000000001" || id == "default-org" {
			writeError(w, http.StatusForbidden, "Forbidden: default organization workspace cannot be deleted")
			return
		}
		if !h.userOwnsTenant(caller, id) {
			writeError(w, http.StatusForbidden, "Forbidden: you can only delete workspaces you created")
			return
		}
	}

	h.mu.Lock()
	delete(h.memTenants, id)

	for devId, dev := range h.memDevices {
		if dev.TenantID == id {
			delete(h.memDevices, devId)
			delete(h.memLatest, devId)
			delete(h.memHistory, devId)
		}
	}

	for chanId, ch := range h.memChannels {
		if ch.TenantID == id {
			delete(h.memChannels, chanId)
		}
	}
	h.mu.Unlock()

	if h.isDBReady() {
		_, _ = h.DB.Exec("DELETE FROM tenants WHERE id::text = $1 OR slug = $1", id)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Tenant workspace and all associated resources deleted successfully",
		"id":      id,
	})
}

// GetChannels handles GET /api/v1/channels
func (h *APIHandler) GetChannels(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized: authentication required to view channels")
		return
	}

	tenantID := strings.TrimSpace(r.URL.Query().Get("tenant_id"))
	var userTenantMap map[string]bool
	if caller.Role != "admin" {
		userTenantIDs := h.getUserTenantIDs(caller)
		userTenantMap = make(map[string]bool)
		for _, tid := range userTenantIDs {
			userTenantMap[tid] = true
		}
		if tenantID != "" {
			if !userTenantMap[tenantID] {
				writeError(w, http.StatusForbidden, "Forbidden: you do not have permission to view channels in this workspace")
				return
			}
		} else if len(userTenantIDs) == 0 {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"count":    0,
				"channels": []models.Channel{},
			})
			return
		}
	}

	if h.isDBReady() {
		var query string
		var rows *sql.Rows
		var err error

		if caller.Role == "admin" {
			query = `
				SELECT c.id, c.tenant_id, c.name, c.group_name, c.topic, COALESCE(c.description, ''),
				       (SELECT COUNT(*) FROM devices d WHERE d.channel_id = c.id) AS devices_count,
				       c.created_at, c.updated_at
				FROM channels c
				WHERE ($1 = '' OR c.tenant_id::text = $1)
				ORDER BY c.created_at ASC;
			`
			rows, err = h.DB.Query(query, tenantID)
		} else if tenantID != "" {
			query = `
				SELECT c.id, c.tenant_id, c.name, c.group_name, c.topic, COALESCE(c.description, ''),
				       (SELECT COUNT(*) FROM devices d WHERE d.channel_id = c.id) AS devices_count,
				       c.created_at, c.updated_at
				FROM channels c
				WHERE c.tenant_id::text = $1
				ORDER BY c.created_at ASC;
			`
			rows, err = h.DB.Query(query, tenantID)
		} else {
			query = `
				SELECT c.id, c.tenant_id, c.name, c.group_name, c.topic, COALESCE(c.description, ''),
				       (SELECT COUNT(*) FROM devices d WHERE d.channel_id = c.id) AS devices_count,
				       c.created_at, c.updated_at
				FROM channels c
				WHERE c.tenant_id IN (
					SELECT id FROM tenants WHERE owner_id = $1 OR owner_id = $2 OR (owner_email != '' AND owner_email = $3)
				)
				ORDER BY c.created_at ASC;
			`
			rows, err = h.DB.Query(query, caller.UserID, caller.Username, caller.Email)
		}

		if err == nil {
			defer rows.Close()
			channels := make([]models.Channel, 0)
			for rows.Next() {
				var ch models.Channel
				if err := rows.Scan(&ch.ID, &ch.TenantID, &ch.Name, &ch.Group, &ch.Topic, &ch.Description, &ch.DevicesCount, &ch.CreatedAt, &ch.UpdatedAt); err == nil {
					channels = append(channels, ch)
				}
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"count":    len(channels),
				"channels": channels,
			})
			return
		}
		log.Printf("[Warning] Database query for channels failed, using in-memory: %v", err)
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	channels := make([]models.Channel, 0)
	for _, ch := range h.memChannels {
		if caller.Role != "admin" {
			if !userTenantMap[ch.TenantID] {
				continue
			}
		}
		if tenantID != "" && ch.TenantID != tenantID {
			continue
		}
		count := 0
		for _, dev := range h.memDevices {
			if dev.ChannelID == ch.ID {
				count++
			}
		}
		ch.DevicesCount = count
		channels = append(channels, ch)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":    len(channels),
		"channels": channels,
	})
}

// CreateChannel handles POST /api/v1/channels
func (h *APIHandler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized: authentication required to create a channel")
		return
	}
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil || len(bodyBytes) == 0 {
		writeError(w, http.StatusBadRequest, "Invalid or empty request body")
		return
	}
	defer r.Body.Close()

	var ch models.Channel
	if err := json.Unmarshal(bodyBytes, &ch); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if strings.TrimSpace(ch.Name) == "" {
		writeError(w, http.StatusBadRequest, "'name' is required")
		return
	}

	if ch.TenantID == "" {
		ch.TenantID = "a0000000-0000-0000-0000-000000000001"
	}

	if caller.Role != "admin" && !h.userOwnsTenant(caller, ch.TenantID) {
		writeError(w, http.StatusForbidden, "Forbidden: you do not have permission to create channels in this workspace")
		return
	}

	if ch.ID == "" {
		slug := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(ch.Name), " ", "-"))
		ch.ID = fmt.Sprintf("chan-%s-%d", slug, time.Now().Unix()%10000)
	}

	if ch.Group == "" {
		ch.Group = "General"
	}

	if ch.Topic == "" {
		ch.Topic = fmt.Sprintf("channels/%s/telemetry", ch.ID)
	}

	ch.CreatedAt = time.Now().UTC()
	ch.UpdatedAt = time.Now().UTC()

	h.mu.Lock()
	h.memChannels[ch.ID] = ch
	h.mu.Unlock()

	if h.isDBReady() {
		query := `
			INSERT INTO channels (id, tenant_id, name, group_name, topic, description, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, topic = EXCLUDED.topic, updated_at = NOW()
			RETURNING id, tenant_id, name, group_name, topic, COALESCE(description, ''), created_at, updated_at;
		`
		var dbCh models.Channel
		err := h.DB.QueryRow(query, ch.ID, ch.TenantID, ch.Name, ch.Group, ch.Topic, ch.Description, ch.CreatedAt, ch.UpdatedAt).Scan(
			&dbCh.ID, &dbCh.TenantID, &dbCh.Name, &dbCh.Group, &dbCh.Topic, &dbCh.Description, &dbCh.CreatedAt, &dbCh.UpdatedAt,
		)
		if err == nil {
			ch = dbCh
		}
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"status":  "success",
		"channel": ch,
	})
}

// DeleteChannel handles DELETE /api/v1/channels/{id}
func (h *APIHandler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized: authentication required")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Channel ID is required in URL path")
		return
	}

	if caller.Role != "admin" {
		var chanTenantID string
		if h.isDBReady() {
			_ = h.DB.QueryRow("SELECT COALESCE(tenant_id::text, '') FROM channels WHERE id = $1", id).Scan(&chanTenantID)
		} else {
			h.mu.RLock()
			if ch, ok := h.memChannels[id]; ok {
				chanTenantID = ch.TenantID
			}
			h.mu.RUnlock()
		}
		if chanTenantID != "" && !h.userOwnsTenant(caller, chanTenantID) {
			writeError(w, http.StatusForbidden, "Forbidden: you do not have permission to delete this channel")
			return
		}
	}

	h.mu.Lock()
	delete(h.memChannels, id)

	for devId, dev := range h.memDevices {
		if dev.ChannelID == id {
			dev.ChannelID = ""
			h.memDevices[devId] = dev
		}
	}
	h.mu.Unlock()

	if h.isDBReady() {
		_, _ = h.DB.Exec("DELETE FROM channels WHERE id = $1", id)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Channel deleted successfully",
		"id":      id,
	})
}

// CreateDevice handles POST /api/v1/devices (Manual Device Registration)
func (h *APIHandler) CreateDevice(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil || len(bodyBytes) == 0 {
		writeError(w, http.StatusBadRequest, "Invalid or empty request body")
		return
	}

	var d models.Device
	if err := json.Unmarshal(bodyBytes, &d); err != nil {
		writeError(w, http.StatusBadRequest, "Malformed JSON payload: "+err.Error())
		return
	}

	d.DeviceID = strings.TrimSpace(d.DeviceID)
	if d.DeviceID == "" {
		writeError(w, http.StatusBadRequest, "device_id is required")
		return
	}
	if strings.TrimSpace(d.Name) == "" {
		d.Name = d.DeviceID
	}
	if d.ID == "" {
		d.ID = d.DeviceID
	}
	if d.TenantID == "" {
		d.TenantID = "a0000000-0000-0000-0000-000000000001"
	}

	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized: authentication required to register a device")
		return
	}
	if caller.Role != "admin" && !h.userOwnsTenant(caller, d.TenantID) {
		writeError(w, http.StatusForbidden, "Forbidden: you do not have permission to register devices in this workspace")
		return
	}
	if d.DeviceType == "" {
		d.DeviceType = "ESP32 + DHT22"
	}
	if d.Status == "" {
		d.Status = "online"
	}
	if d.FirmwareVersion == "" {
		d.FirmwareVersion = "v1.0.0"
	}
	if d.AuthToken == "" {
		tokenBytes := make([]byte, 16)
		_, _ = rand.Read(tokenBytes)
		d.AuthToken = fmt.Sprintf("dev_tok_%x", tokenBytes)
	}
	if len(d.Metadata) == 0 {
		d.Metadata = json.RawMessage("{}")
	}

	now := time.Now().UTC()
	d.CreatedAt = now
	d.UpdatedAt = now

	// Save to DB
	if h.isDBReady() {
		if d.ChannelID != "" {
			query := `
				INSERT INTO devices (tenant_id, channel_id, device_id, name, device_type, status, auth_token, firmware_version, metadata, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
				ON CONFLICT (tenant_id, device_id) DO UPDATE SET
					name = EXCLUDED.name,
					device_type = EXCLUDED.device_type,
					channel_id = EXCLUDED.channel_id,
					status = EXCLUDED.status,
					updated_at = NOW();
			`
			_, err := h.DB.Exec(query, d.TenantID, d.ChannelID, d.DeviceID, d.Name, d.DeviceType, d.Status, d.AuthToken, d.FirmwareVersion, string(d.Metadata), now, now)
			if err != nil {
				log.Printf("[DB] Error inserting device with channel: %v, attempting fallback without channel", err)
				fallbackQuery := `
					INSERT INTO devices (tenant_id, device_id, name, device_type, status, auth_token, firmware_version, metadata, created_at, updated_at)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
					ON CONFLICT (tenant_id, device_id) DO UPDATE SET
						name = EXCLUDED.name,
						device_type = EXCLUDED.device_type,
						status = EXCLUDED.status,
						updated_at = NOW();
				`
				_, _ = h.DB.Exec(fallbackQuery, d.TenantID, d.DeviceID, d.Name, d.DeviceType, d.Status, d.AuthToken, d.FirmwareVersion, string(d.Metadata), now, now)
			}
		} else {
			query := `
				INSERT INTO devices (tenant_id, device_id, name, device_type, status, auth_token, firmware_version, metadata, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
				ON CONFLICT (tenant_id, device_id) DO UPDATE SET
					name = EXCLUDED.name,
					device_type = EXCLUDED.device_type,
					status = EXCLUDED.status,
					updated_at = NOW();
			`
			_, _ = h.DB.Exec(query, d.TenantID, d.DeviceID, d.Name, d.DeviceType, d.Status, d.AuthToken, d.FirmwareVersion, string(d.Metadata), now, now)
		}
	}

	// Save to in-memory map
	h.mu.Lock()
	h.memDevices[d.DeviceID] = d
	h.mu.Unlock()

	writeJSON(w, http.StatusCreated, d)
}

// UpdateDevice handles PATCH /api/v1/devices/{id} and PUT /api/v1/devices/{id}
func (h *APIHandler) UpdateDevice(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil || len(bodyBytes) == 0 {
		writeError(w, http.StatusBadRequest, "Invalid or empty request body")
		return
	}
	defer r.Body.Close()

	var req struct {
		Name       *string `json:"name"`
		ChannelID  *string `json:"channel_id"`
		DeviceType *string `json:"device_type"`
		Status     *string `json:"status"`
	}
	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		writeError(w, http.StatusBadRequest, "Malformed JSON payload: "+err.Error())
		return
	}

	now := time.Now().UTC()

	// Update DB
	if h.isDBReady() {
		if req.ChannelID != nil {
			trimmedChannelID := strings.TrimSpace(*req.ChannelID)
			if trimmedChannelID == "" {
				_, err = h.DB.Exec("UPDATE devices SET channel_id = NULL, updated_at = $2 WHERE id::text = $1 OR device_id = $1", id, now)
			} else {
				_, err = h.DB.Exec("UPDATE devices SET channel_id = $2, updated_at = $3 WHERE id::text = $1 OR device_id = $1", id, trimmedChannelID, now)
			}
			if err != nil {
				log.Printf("[DB] Error updating device channel_id: %v", err)
			}
		}

		if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
			_, _ = h.DB.Exec("UPDATE devices SET name = $2, updated_at = $3 WHERE id::text = $1 OR device_id = $1", id, strings.TrimSpace(*req.Name), now)
		}
		if req.DeviceType != nil && strings.TrimSpace(*req.DeviceType) != "" {
			_, _ = h.DB.Exec("UPDATE devices SET device_type = $2, updated_at = $3 WHERE id::text = $1 OR device_id = $1", id, strings.TrimSpace(*req.DeviceType), now)
		}
		if req.Status != nil && strings.TrimSpace(*req.Status) != "" {
			_, _ = h.DB.Exec("UPDATE devices SET status = $2, updated_at = $3 WHERE id::text = $1 OR device_id = $1", id, strings.TrimSpace(*req.Status), now)
		}
	}

	// Update in-memory map
	h.mu.Lock()
	var updatedDev *models.Device
	for k, dev := range h.memDevices {
		if k == id || dev.ID == id || dev.DeviceID == id {
			if req.ChannelID != nil {
				dev.ChannelID = strings.TrimSpace(*req.ChannelID)
			}
			if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
				dev.Name = strings.TrimSpace(*req.Name)
			}
			if req.DeviceType != nil && strings.TrimSpace(*req.DeviceType) != "" {
				dev.DeviceType = strings.TrimSpace(*req.DeviceType)
			}
			if req.Status != nil && strings.TrimSpace(*req.Status) != "" {
				dev.Status = strings.TrimSpace(*req.Status)
			}
			dev.UpdatedAt = now
			h.memDevices[k] = dev
			updatedDev = &dev
			break
		}
	}
	h.mu.Unlock()

	if updatedDev == nil {
		// If not in memory, query DB
		if h.isDBReady() {
			var d models.Device
			var metadataBytes []byte
			query := `SELECT id, tenant_id, COALESCE(channel_id::text, ''), device_id, name, device_type, status, 
			                 COALESCE(auth_token, ''), COALESCE(firmware_version, 'v1.0.0'), metadata, created_at, updated_at
			          FROM devices WHERE id::text = $1 OR device_id = $1 LIMIT 1;`
			err = h.DB.QueryRow(query, id).Scan(
				&d.ID, &d.TenantID, &d.ChannelID, &d.DeviceID, &d.Name, &d.DeviceType, &d.Status,
				&d.AuthToken, &d.FirmwareVersion, &metadataBytes, &d.CreatedAt, &d.UpdatedAt,
			)
			if err == nil {
				d.Metadata = json.RawMessage(metadataBytes)
				h.mu.Lock()
				h.memDevices[d.DeviceID] = d
				h.mu.Unlock()
				updatedDev = &d
			}
		}
	}

	if updatedDev == nil {
		writeError(w, http.StatusNotFound, "Device not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Device updated successfully",
		"device":  updatedDev,
	})
}

// GetDevices handles GET /api/v1/devices
func (h *APIHandler) GetDevices(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized: authentication required to view devices")
		return
	}

	tenantID := strings.TrimSpace(r.URL.Query().Get("tenant_id"))
	channelID := strings.TrimSpace(r.URL.Query().Get("channel_id"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))

	var userTenantMap map[string]bool
	if caller.Role != "admin" {
		userTenantIDs := h.getUserTenantIDs(caller)
		userTenantMap = make(map[string]bool)
		for _, tid := range userTenantIDs {
			userTenantMap[tid] = true
		}

		if tenantID != "" {
			if !userTenantMap[tenantID] {
				writeError(w, http.StatusForbidden, "Forbidden: you do not have permission to view devices in this workspace")
				return
			}
		} else if len(userTenantIDs) == 0 {
			// Regular user has no workspaces, returns 0 devices
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"count":   0,
				"devices": []models.Device{},
			})
			return
		}
	}

	if h.isDBReady() {
		var rows *sql.Rows
		var err error

		if caller.Role == "admin" {
			query := `
				SELECT id, tenant_id, COALESCE(channel_id::text, ''), device_id, name, device_type, status, 
				       COALESCE(auth_token, ''), COALESCE(firmware_version, 'v1.0.0'), metadata, created_at, updated_at
				FROM devices
				WHERE ($1 = '' OR tenant_id::text = $1)
				  AND ($2 = '' OR channel_id = $2)
				  AND ($3 = '' OR status = $3)
				ORDER BY created_at DESC;
			`
			rows, err = h.DB.Query(query, tenantID, channelID, status)
		} else if tenantID != "" {
			query := `
				SELECT id, tenant_id, COALESCE(channel_id::text, ''), device_id, name, device_type, status, 
				       COALESCE(auth_token, ''), COALESCE(firmware_version, 'v1.0.0'), metadata, created_at, updated_at
				FROM devices
				WHERE tenant_id::text = $1
				  AND ($2 = '' OR channel_id = $2)
				  AND ($3 = '' OR status = $3)
				ORDER BY created_at DESC;
			`
			rows, err = h.DB.Query(query, tenantID, channelID, status)
		} else {
			// Regular user without tenant filter: scope to all caller-owned tenants
			query := `
				SELECT id, tenant_id, COALESCE(channel_id::text, ''), device_id, name, device_type, status, 
				       COALESCE(auth_token, ''), COALESCE(firmware_version, 'v1.0.0'), metadata, created_at, updated_at
				FROM devices
				WHERE tenant_id IN (
					SELECT id FROM tenants WHERE owner_id = $1 OR owner_id = $2 OR (owner_email != '' AND owner_email = $3)
				)
				  AND ($4 = '' OR channel_id = $4)
				  AND ($5 = '' OR status = $5)
				ORDER BY created_at DESC;
			`
			rows, err = h.DB.Query(query, caller.UserID, caller.Username, caller.Email, channelID, status)
		}

		if err == nil {
			defer rows.Close()
			devices := make([]models.Device, 0)
			for rows.Next() {
				var d models.Device
				var metadataBytes []byte
				if err := rows.Scan(
					&d.ID, &d.TenantID, &d.ChannelID, &d.DeviceID, &d.Name, &d.DeviceType, &d.Status,
					&d.AuthToken, &d.FirmwareVersion,
					&metadataBytes, &d.CreatedAt, &d.UpdatedAt,
				); err == nil {
					d.Metadata = json.RawMessage(metadataBytes)
					devices = append(devices, d)
				}
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"count":   len(devices),
				"devices": devices,
			})
			return
		}
		log.Printf("[Warning] Database query failed, using in-memory fallback: %v", err)
	}

	// In-memory fallback
	h.mu.RLock()
	defer h.mu.RUnlock()
	devices := make([]models.Device, 0)
	for _, d := range h.memDevices {
		if caller.Role != "admin" {
			if !userTenantMap[d.TenantID] {
				continue
			}
		}
		if tenantID != "" && d.TenantID != tenantID {
			continue
		}
		if channelID != "" && d.ChannelID != channelID {
			continue
		}
		if status != "" && d.Status != status {
			continue
		}
		devices = append(devices, d)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":   len(devices),
		"devices": devices,
	})
}

// GetLatestTelemetry handles GET /api/v1/devices/{id}/telemetry/latest
func (h *APIHandler) GetLatestTelemetry(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized: authentication required")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
	}

	device, err := h.resolveDevice(id)
	if err == nil && caller.Role != "admin" && !h.userOwnsTenant(caller, device.TenantID) {
		writeError(w, http.StatusForbidden, "Forbidden: you do not have permission to view telemetry for this device")
		return
	}

	if h.isDBReady() {
		if err == nil {
			query := `
				SELECT tenant_id, device_id, time, payload, updated_at
				FROM latest_telemetry
				WHERE tenant_id = $1 AND device_id = $2;
			`

			var lt models.LatestTelemetry
			var payloadBytes []byte
			err = h.DB.QueryRow(query, device.TenantID, device.DeviceID).Scan(
				&lt.TenantID, &lt.DeviceID, &lt.Time, &payloadBytes, &lt.UpdatedAt,
			)
			if err == nil {
				lt.Payload = json.RawMessage(payloadBytes)
				writeJSON(w, http.StatusOK, lt)
				return
			}
		}
	}

	// In-memory fallback
	h.mu.RLock()
	defer h.mu.RUnlock()
	if lt, ok := h.memLatest[id]; ok {
		writeJSON(w, http.StatusOK, lt)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"device_id": id,
		"message":   "No telemetry recorded for this device yet",
		"latest":    nil,
	})
}

func generateSecureToken(prefix string) string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return fmt.Sprintf("tok_%s_%x", prefix, b)
}

func downsampleRecords(records []models.TelemetryRecord, resolution string) []models.TelemetryRecord {
	var bucketDuration time.Duration
	switch resolution {
	case "1m":
		bucketDuration = time.Minute
	case "5m":
		bucketDuration = 5 * time.Minute
	case "1h":
		bucketDuration = time.Hour
	default:
		return records
	}

	type bucketAgg struct {
		bucket   time.Time
		tenantID string
		deviceID string
		tempSum  float64
		tempMin  float64
		tempMax  float64
		hasTemp  bool
		humSum   float64
		humMin   float64
		humMax   float64
		hasHum   bool
		rssiSum  float64
		hasRssi  bool
		count    int64
	}

	buckets := make(map[time.Time]*bucketAgg)
	orderKeys := make([]time.Time, 0)

	for _, r := range records {
		bTime := r.Time.Truncate(bucketDuration)
		bag, exists := buckets[bTime]
		if !exists {
			bag = &bucketAgg{
				bucket:   bTime,
				tenantID: r.TenantID,
				deviceID: r.DeviceID,
			}
			buckets[bTime] = bag
			orderKeys = append(orderKeys, bTime)
		}

		var m map[string]interface{}
		if err := json.Unmarshal(r.Payload, &m); err == nil {
			if v, ok := m["temperature_c"].(float64); ok {
				if !bag.hasTemp {
					bag.tempMin = v
					bag.tempMax = v
					bag.hasTemp = true
				} else {
					if v < bag.tempMin {
						bag.tempMin = v
					}
					if v > bag.tempMax {
						bag.tempMax = v
					}
				}
				bag.tempSum += v
			}
			if v, ok := m["humidity_pct"].(float64); ok {
				if !bag.hasHum {
					bag.humMin = v
					bag.humMax = v
					bag.hasHum = true
				} else {
					if v < bag.humMin {
						bag.humMin = v
					}
					if v > bag.humMax {
						bag.humMax = v
					}
				}
				bag.humSum += v
			}
			if v, ok := m["wifi_rssi"].(float64); ok {
				bag.rssiSum += v
				bag.hasRssi = true
			}
		}
		bag.count++
	}

	result := make([]models.TelemetryRecord, 0, len(orderKeys))
	for _, k := range orderKeys {
		bag := buckets[k]
		payload := map[string]interface{}{
			"sample_count": bag.count,
		}
		if bag.hasTemp && bag.count > 0 {
			payload["temperature_c"] = math.Round((bag.tempSum/float64(bag.count))*100) / 100
			payload["temperature_c_min"] = bag.tempMin
			payload["temperature_c_max"] = bag.tempMax
		}
		if bag.hasHum && bag.count > 0 {
			payload["humidity_pct"] = math.Round((bag.humSum/float64(bag.count))*100) / 100
			payload["humidity_pct_min"] = bag.humMin
			payload["humidity_pct_max"] = bag.humMax
		}
		if bag.hasRssi && bag.count > 0 {
			payload["wifi_rssi"] = math.Round((bag.rssiSum/float64(bag.count))*100) / 100
		}
		pBytes, _ := json.Marshal(payload)
		result = append(result, models.TelemetryRecord{
			Time:      bag.bucket,
			TenantID:  bag.tenantID,
			DeviceID:  bag.deviceID,
			Payload:   pBytes,
			CreatedAt: bag.bucket,
		})
	}
	return result
}

// GetTelemetryHistory handles GET /api/v1/devices/{id}/telemetry/history
func (h *APIHandler) GetTelemetryHistory(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized: authentication required")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
	}

	device, err := h.resolveDevice(id)
	if err == nil && caller.Role != "admin" && !h.userOwnsTenant(caller, device.TenantID) {
		writeError(w, http.StatusForbidden, "Forbidden: you do not have permission to view telemetry for this device")
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 {
			if parsed > 1000 {
				limit = 1000
			} else {
				limit = parsed
			}
		}
	}

	resolution := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("resolution")))
	if resolution != "1m" && resolution != "5m" && resolution != "1h" {
		resolution = "raw"
	}

	if h.isDBReady() {
		device, err := h.resolveDevice(id)
		if err == nil {
			order := strings.ToUpper(r.URL.Query().Get("order"))
			if order != "ASC" {
				order = "DESC"
			}

			var startTime, endTime *time.Time
			if startStr := r.URL.Query().Get("start"); startStr != "" {
				if t, err := time.Parse(time.RFC3339, startStr); err == nil {
					startTime = &t
				}
			} else if fromStr := r.URL.Query().Get("from"); fromStr != "" {
				if t, err := time.Parse(time.RFC3339, fromStr); err == nil {
					startTime = &t
				}
			}

			if endStr := r.URL.Query().Get("end"); endStr != "" {
				if t, err := time.Parse(time.RFC3339, endStr); err == nil {
					endTime = &t
				}
			} else if toStr := r.URL.Query().Get("to"); toStr != "" {
				if t, err := time.Parse(time.RFC3339, toStr); err == nil {
					endTime = &t
				}
			}

			// Continuous Aggregate query when downsampled resolution requested
			if resolution == "1m" || resolution == "5m" || resolution == "1h" {
				viewName := "telemetry_" + resolution
				aggQuery := fmt.Sprintf(`
					SELECT bucket, tenant_id, device_id, 
					       COALESCE(avg_temperature, 0), COALESCE(min_temperature, 0), COALESCE(max_temperature, 0),
					       COALESCE(avg_humidity, 0), COALESCE(min_humidity, 0), COALESCE(max_humidity, 0),
					       COALESCE(avg_wifi_rssi, 0), COALESCE(sample_count, 0)
					FROM %s
					WHERE tenant_id = $1 AND device_id = $2
					  AND ($3::timestamptz IS NULL OR bucket >= $3)
					  AND ($4::timestamptz IS NULL OR bucket <= $4)
					ORDER BY bucket %s
					LIMIT $5;
				`, viewName, order)

				aggRows, aggErr := h.DB.Query(aggQuery, device.TenantID, device.DeviceID, startTime, endTime, limit)
				if aggErr == nil {
					defer aggRows.Close()
					records := make([]models.TelemetryRecord, 0)
					for aggRows.Next() {
						var bucket time.Time
						var tID, dID string
						var avgTemp, minTemp, maxTemp, avgHum, minHum, maxHum, avgRssi float64
						var count int64
						if err := aggRows.Scan(&bucket, &tID, &dID, &avgTemp, &minTemp, &maxTemp, &avgHum, &minHum, &maxHum, &avgRssi, &count); err == nil {
							pMap := map[string]interface{}{
								"temperature_c":     math.Round(avgTemp*100) / 100,
								"temperature_c_min": math.Round(minTemp*100) / 100,
								"temperature_c_max": math.Round(maxTemp*100) / 100,
								"humidity_pct":      math.Round(avgHum*100) / 100,
								"humidity_pct_min":  math.Round(minHum*100) / 100,
								"humidity_pct_max":  math.Round(maxHum*100) / 100,
								"wifi_rssi":         math.Round(avgRssi*100) / 100,
								"sample_count":      count,
							}
							pBytes, _ := json.Marshal(pMap)
							records = append(records, models.TelemetryRecord{
								Time:      bucket,
								TenantID:  tID,
								DeviceID:  dID,
								Payload:   pBytes,
								CreatedAt: bucket,
							})
						}
					}
					writeJSON(w, http.StatusOK, map[string]interface{}{
						"device_id":  device.DeviceID,
						"tenant_id":  device.TenantID,
						"resolution": resolution,
						"count":      len(records),
						"history":    records,
					})
					return
				}
			}

			// Raw telemetry query
			var query string
			if order == "ASC" {
				query = `
					SELECT time, tenant_id, device_id, payload, created_at
					FROM (
						SELECT time, tenant_id, device_id, payload, created_at
						FROM telemetry
						WHERE tenant_id = $1 AND device_id = $2
						  AND ($3::timestamptz IS NULL OR time >= $3)
						  AND ($4::timestamptz IS NULL OR time <= $4)
						ORDER BY time DESC
						LIMIT $5
					) sub
					ORDER BY time ASC;
				`
			} else {
				query = `
					SELECT time, tenant_id, device_id, payload, created_at
					FROM telemetry
					WHERE tenant_id = $1 AND device_id = $2
					  AND ($3::timestamptz IS NULL OR time >= $3)
					  AND ($4::timestamptz IS NULL OR time <= $4)
					ORDER BY time DESC
					LIMIT $5;
				`
			}

			rows, err := h.DB.Query(query, device.TenantID, device.DeviceID, startTime, endTime, limit)
			if err == nil {
				defer rows.Close()
				records := make([]models.TelemetryRecord, 0)
				for rows.Next() {
					var tr models.TelemetryRecord
					var payloadBytes []byte
					if err := rows.Scan(&tr.Time, &tr.TenantID, &tr.DeviceID, &payloadBytes, &tr.CreatedAt); err == nil {
						tr.Payload = json.RawMessage(payloadBytes)
						records = append(records, tr)
					}
				}

				if resolution == "1m" || resolution == "5m" || resolution == "1h" {
					records = downsampleRecords(records, resolution)
				}

				writeJSON(w, http.StatusOK, map[string]interface{}{
					"device_id":  device.DeviceID,
					"tenant_id":  device.TenantID,
					"resolution": resolution,
					"count":      len(records),
					"history":    records,
				})
				return
			}
		}
	}

	// In-memory fallback
	h.mu.RLock()
	defer h.mu.RUnlock()
	records := h.memHistory[id]
	if records == nil {
		records = make([]models.TelemetryRecord, 0)
	}

	if resolution == "1m" || resolution == "5m" || resolution == "1h" {
		records = downsampleRecords(records, resolution)
	}

	if len(records) > limit {
		records = records[len(records)-limit:]
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"device_id":  id,
		"tenant_id":  "a0000000-0000-0000-0000-000000000001",
		"resolution": resolution,
		"count":      len(records),
		"history":    records,
	})
}

// RegenerateDeviceToken handles POST /api/v1/devices/{id}/token
func (h *APIHandler) RegenerateDeviceToken(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
	}

	newToken := generateSecureToken(id)

	h.mu.Lock()
	if dev, exists := h.memDevices[id]; exists {
		dev.AuthToken = newToken
		dev.UpdatedAt = time.Now().UTC()
		h.memDevices[id] = dev
	}
	h.mu.Unlock()

	if h.isDBReady() {
		_, _ = h.DB.Exec("UPDATE devices SET auth_token = $1, updated_at = NOW() WHERE device_id = $2 OR id::text = $2", newToken, id)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "success",
		"device_id":  id,
		"auth_token": newToken,
		"message":    "Device security token regenerated successfully",
	})
}

// ProcessTelemetry is the central thread-safe ingestion method used by both HTTP and MQTT subscribers.
// It guarantees data is immediately visible in-memory and persisted to TimescaleDB if online.
func (h *APIHandler) ProcessTelemetry(tenantID, channelID, deviceID string, telemetryTime time.Time, payloadData []byte) error {
	if deviceID == "" {
		return fmt.Errorf("device_id is required")
	}

	if tenantID == "" {
		tenantID = "a0000000-0000-0000-0000-000000000001"
	}

	if telemetryTime.IsZero() {
		telemetryTime = time.Now().UTC()
	}

	// 1. Thread-safe in-memory cache update
	h.mu.Lock()
	existingDev, exists := h.memDevices[deviceID]
	if !exists {
		existingDev = models.Device{
			ID:         deviceID,
			TenantID:   tenantID,
			ChannelID:  channelID,
			DeviceID:   deviceID,
			Name:            deviceID,
			DeviceType:      "ESP32",
			Status:          "online",
			AuthToken:       generateSecureToken(deviceID),
			FirmwareVersion: "v1.0.0",
			Metadata:        json.RawMessage(`{}`),
			CreatedAt:       time.Now().UTC(),
			UpdatedAt:       time.Now().UTC(),
		}
	} else {
		existingDev.Status = "online"
		existingDev.UpdatedAt = time.Now().UTC()
		if existingDev.AuthToken == "" {
			existingDev.AuthToken = generateSecureToken(deviceID)
		}
		if existingDev.FirmwareVersion == "" {
			existingDev.FirmwareVersion = "v1.0.0"
		}
		if channelID != "" {
			existingDev.ChannelID = channelID
		}
	}
	h.memDevices[deviceID] = existingDev

	lt := models.LatestTelemetry{
		TenantID:  tenantID,
		DeviceID:  deviceID,
		Time:      telemetryTime,
		Payload:   json.RawMessage(payloadData),
		UpdatedAt: time.Now().UTC(),
	}
	h.memLatest[deviceID] = lt

	record := models.TelemetryRecord{
		Time:      telemetryTime,
		TenantID:  tenantID,
		DeviceID:  deviceID,
		Payload:   json.RawMessage(payloadData),
		CreatedAt: time.Now().UTC(),
	}
	h.memHistory[deviceID] = append(h.memHistory[deviceID], record)
	if len(h.memHistory[deviceID]) > 500 {
		h.memHistory[deviceID] = h.memHistory[deviceID][len(h.memHistory[deviceID])-500:]
	}
	h.mu.Unlock()

	// Zero-latency real-time SSE broadcast
	if h.sseBroker != nil {
		h.sseBroker.Broadcast("telemetry", lt)
	}

	// 2. Persist to TimescaleDB if connected
	if h.isDBReady() {
		_, _ = h.DB.Exec(`
			INSERT INTO tenants (id, name, slug)
			VALUES ($1, 'Workspace ' || SUBSTRING($1::text, 1, 8), 'workspace-' || SUBSTRING($1::text, 1, 8))
			ON CONFLICT (id) DO NOTHING;
		`, tenantID)

		if channelID != "" {
			regQuery := `
				INSERT INTO devices (tenant_id, channel_id, device_id, name, device_type, status)
				VALUES ($1, $2, $3, $3, 'ESP32', 'online')
				ON CONFLICT (tenant_id, device_id) DO UPDATE SET status = 'online', channel_id = EXCLUDED.channel_id, updated_at = NOW();
			`
			_, err := h.DB.Exec(regQuery, tenantID, channelID, deviceID)
			if err != nil {
				regFallback := `
					INSERT INTO devices (tenant_id, device_id, name, device_type, status)
					VALUES ($1, $2, $2, 'ESP32', 'online')
					ON CONFLICT (tenant_id, device_id) DO UPDATE SET status = 'online', updated_at = NOW();
				`
				_, _ = h.DB.Exec(regFallback, tenantID, deviceID)
			}
		} else {
			regQuery := `
				INSERT INTO devices (tenant_id, device_id, name, device_type, status)
				VALUES ($1, $2, $2, 'ESP32', 'online')
				ON CONFLICT (tenant_id, device_id) DO UPDATE SET status = 'online', updated_at = NOW();
			`
			_, _ = h.DB.Exec(regQuery, tenantID, deviceID)
		}

		insertQuery := `
			INSERT INTO telemetry (time, tenant_id, device_id, payload)
			VALUES ($1, $2, $3, $4);
		`
		if _, err := h.DB.Exec(insertQuery, telemetryTime, tenantID, deviceID, payloadData); err != nil {
			log.Printf("[DB] Error inserting telemetry record for %s: %v", deviceID, err)
		}
	}

	// 3. Evaluate dynamic JSON guardrail rules (never hardcoded in if statements)
	h.evaluateRules(tenantID, deviceID, payloadData)

	return nil
}

// IngestDeviceTelemetry handles POST /api/v1/devices/{id}/telemetry
func (h *APIHandler) IngestDeviceTelemetry(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil || len(bodyBytes) == 0 {
		writeError(w, http.StatusBadRequest, "Invalid or empty request body")
		return
	}
	defer r.Body.Close()

	var rawObj map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &rawObj); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	tenantID := "a0000000-0000-0000-0000-000000000001"
	if t, ok := rawObj["tenant_id"].(string); ok && t != "" {
		tenantID = t
	}

	channelID := ""
	if c, ok := rawObj["channel_id"].(string); ok && c != "" {
		channelID = c
	}

	telemetryTime := time.Now().UTC()
	var payloadData []byte

	if wrappedPayload, hasPayload := rawObj["payload"]; hasPayload {
		payloadData, _ = json.Marshal(wrappedPayload)
		if tStr, hasTime := rawObj["time"].(string); hasTime {
			if parsedT, err := time.Parse(time.RFC3339, tStr); err == nil {
				telemetryTime = parsedT
			}
		}
	} else {
		payloadData = bodyBytes
	}

	if err := h.ProcessTelemetry(tenantID, channelID, id, telemetryTime, payloadData); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"status":    "success",
		"message":   "Telemetry ingested successfully",
		"device_id": id,
		"time":      telemetryTime.Format(time.RFC3339Nano),
	})
}

// IngestTelemetry handles POST /api/v1/telemetry
func (h *APIHandler) IngestTelemetry(w http.ResponseWriter, r *http.Request) {
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil || len(bodyBytes) == 0 {
		writeError(w, http.StatusBadRequest, "Invalid or empty request body")
		return
	}
	defer r.Body.Close()

	var req models.TelemetryIngestPayload
	if err := json.Unmarshal(bodyBytes, &req); err != nil || req.DeviceID == "" {
		writeError(w, http.StatusBadRequest, "JSON must contain at least 'device_id'")
		return
	}

	r.SetPathValue("id", req.DeviceID)
	h.IngestDeviceTelemetry(w, r)
}

// DeleteDevice handles DELETE /api/v1/devices/{id}
func (h *APIHandler) DeleteDevice(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized: authentication required")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
	}

	if caller.Role != "admin" {
		dev, err := h.resolveDevice(id)
		if err != nil {
			writeError(w, http.StatusNotFound, "Device not found")
			return
		}
		if !h.userOwnsTenant(caller, dev.TenantID) {
			writeError(w, http.StatusForbidden, "Forbidden: you do not have permission to delete this device")
			return
		}
	}

	h.mu.Lock()
	delete(h.memDevices, id)
	delete(h.memLatest, id)
	delete(h.memHistory, id)
	h.mu.Unlock()

	if h.isDBReady() {
		_, _ = h.DB.Exec("DELETE FROM devices WHERE id::text = $1 OR device_id = $1", id)
		_, _ = h.DB.Exec("DELETE FROM latest_telemetry WHERE device_id = $1", id)
		_, _ = h.DB.Exec("DELETE FROM telemetry WHERE device_id = $1", id)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Device and telemetry cleared successfully",
	})
}

// ResetDevices handles POST /api/v1/devices/reset
func (h *APIHandler) ResetDevices(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil || caller.Role != "admin" {
		writeError(w, http.StatusForbidden, "Forbidden: administrator privileges required to reset platform devices")
		return
	}

	h.mu.Lock()
	h.memDevices = make(map[string]models.Device)
	h.memLatest = make(map[string]models.LatestTelemetry)
	h.memHistory = make(map[string][]models.TelemetryRecord)
	h.mu.Unlock()

	if h.isDBReady() {
		_, _ = h.DB.Exec("DELETE FROM latest_telemetry")
		_, _ = h.DB.Exec("DELETE FROM telemetry")
		_, _ = h.DB.Exec("DELETE FROM devices")
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "All devices and telemetry reset successfully",
	})
}

// SetTelemetryRetention updates the global maximum telemetry records and background prune interval.
func (h *APIHandler) SetTelemetryRetention(maxRecords, pruneIntervalSec int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if maxRecords > 0 {
		h.maxTelemetryRecords = maxRecords
	}
	if pruneIntervalSec > 0 {
		h.pruneIntervalSec = pruneIntervalSec
	}
}

// GetMaxTelemetryRecords returns the maximum telemetry records allowed globally (default: 10,000).
func (h *APIHandler) GetMaxTelemetryRecords() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if h.maxTelemetryRecords <= 0 {
		return 10000
	}
	return h.maxTelemetryRecords
}

// GetPruneIntervalSec returns the retention worker interval in seconds (default: 30s).
func (h *APIHandler) GetPruneIntervalSec() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if h.pruneIntervalSec <= 0 {
		return 30
	}
	return h.pruneIntervalSec
}

// PruneOldTelemetry removes older telemetry records from the database and in-memory cache
// when total records exceed maxRecords, keeping strictly the newest maxRecords.
func (h *APIHandler) PruneOldTelemetry(maxRecords int) (int64, error) {
	if maxRecords <= 0 {
		maxRecords = h.GetMaxTelemetryRecords()
	}

	var totalDeleted int64

	// 1. Persistent Database Pruning (TimescaleDB / PostgreSQL)
	if h.isDBReady() {
		var cutoffTime time.Time
		var cutoffCreatedAt time.Time

		// Query the boundary timestamp of the maxRecords-th newest record (0-indexed offset = maxRecords - 1)
		err := h.DB.QueryRow(`
			SELECT time, created_at
			FROM telemetry
			ORDER BY time DESC, created_at DESC
			OFFSET $1 LIMIT 1;
		`, maxRecords-1).Scan(&cutoffTime, &cutoffCreatedAt)

		if err != nil {
			if err != sql.ErrNoRows {
				return totalDeleted, fmt.Errorf("failed checking telemetry retention cutoff: %w", err)
			}
			// When err == sql.ErrNoRows, total records <= maxRecords; nothing to prune in DB.
		} else {
			// Delete all rows strictly older than the cutoff boundary
			res, delErr := h.DB.Exec(`
				DELETE FROM telemetry
				WHERE time < $1 OR (time = $1 AND created_at < $2);
			`, cutoffTime, cutoffCreatedAt)
			if delErr != nil {
				return totalDeleted, fmt.Errorf("failed deleting old telemetry: %w", delErr)
			}
			deletedCount, _ := res.RowsAffected()
			totalDeleted += deletedCount
		}
	}

	// 2. In-Memory Cache Pruning (Resilient Standalone Mode)
	h.mu.Lock()
	defer h.mu.Unlock()

	totalMemRecords := 0
	for _, records := range h.memHistory {
		totalMemRecords += len(records)
	}

	if totalMemRecords > maxRecords {
		type recordRef struct {
			devID string
			time  time.Time
			rec   models.TelemetryRecord
		}
		allRecs := make([]recordRef, 0, totalMemRecords)
		for devID, recs := range h.memHistory {
			for _, r := range recs {
				allRecs = append(allRecs, recordRef{devID: devID, time: r.Time, rec: r})
			}
		}

		// Sort newest to oldest
		sort.Slice(allRecs, func(i, j int) bool {
			return allRecs[i].time.After(allRecs[j].time)
		})

		// Keep only the newest maxRecords
		keptRecs := allRecs[:maxRecords]
		excess := int64(totalMemRecords - maxRecords)

		// Rebuild memHistory grouped by devID while maintaining original chronological order
		newMemHistory := make(map[string][]models.TelemetryRecord)
		for devID := range h.memDevices {
			newMemHistory[devID] = make([]models.TelemetryRecord, 0)
		}
		// Iterate keptRecs in reverse (oldest of kept to newest) so append preserves chronological order
		for i := len(keptRecs) - 1; i >= 0; i-- {
			r := keptRecs[i]
			newMemHistory[r.devID] = append(newMemHistory[r.devID], r.rec)
		}
		h.memHistory = newMemHistory
		totalDeleted += excess
	}

	return totalDeleted, nil
}

// PruneTelemetryHTTP handles POST /api/v1/telemetry/prune
func (h *APIHandler) PruneTelemetryHTTP(w http.ResponseWriter, r *http.Request) {
	maxRecords := h.GetMaxTelemetryRecords()

	if r.Body != nil && r.ContentLength > 0 {
		var req struct {
			MaxRecords int `json:"max_records"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil && req.MaxRecords > 0 {
			maxRecords = req.MaxRecords
		}
	}

	pruned, err := h.PruneOldTelemetry(maxRecords)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Pruning failed: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":         "success",
		"message":        fmt.Sprintf("Pruned %d older telemetry records exceeding %d limit", pruned, maxRecords),
		"pruned_records": pruned,
		"max_records":    maxRecords,
		"timestamp":      time.Now().UTC().Format(time.RFC3339),
	})
}

// GetTelemetryStats handles GET /api/v1/telemetry/stats
func (h *APIHandler) GetTelemetryStats(w http.ResponseWriter, r *http.Request) {
	stats := map[string]interface{}{
		"max_records":        h.GetMaxTelemetryRecords(),
		"prune_interval_sec": h.GetPruneIntervalSec(),
	}

	if h.isDBReady() {
		var total int64
		var oldest, newest sql.NullTime

		err := h.DB.QueryRow(`
			SELECT COUNT(*), MIN(time), MAX(time)
			FROM telemetry;
		`).Scan(&total, &oldest, &newest)

		if err == nil {
			stats["total_records"] = total
			if oldest.Valid {
				stats["oldest_record_time"] = oldest.Time.Format(time.RFC3339)
			} else {
				stats["oldest_record_time"] = nil
			}
			if newest.Valid {
				stats["newest_record_time"] = newest.Time.Format(time.RFC3339)
			} else {
				stats["newest_record_time"] = nil
			}
			stats["storage_mode"] = "timescaledb"
			writeJSON(w, http.StatusOK, stats)
			return
		}
	}

	// In-memory stats fallback
	h.mu.RLock()
	total := 0
	var oldest, newest time.Time
	hasRecords := false

	for _, records := range h.memHistory {
		total += len(records)
		for _, r := range records {
			if !hasRecords {
				oldest = r.Time
				newest = r.Time
				hasRecords = true
			} else {
				if r.Time.Before(oldest) {
					oldest = r.Time
				}
				if r.Time.After(newest) {
					newest = r.Time
				}
			}
		}
	}
	h.mu.RUnlock()

	stats["total_records"] = total
	stats["storage_mode"] = "in-memory"
	if hasRecords {
		stats["oldest_record_time"] = oldest.Format(time.RFC3339)
		stats["newest_record_time"] = newest.Format(time.RFC3339)
	} else {
		stats["oldest_record_time"] = nil
		stats["newest_record_time"] = nil
	}

	writeJSON(w, http.StatusOK, stats)
}

// ProcessCommandAck handles incoming MQTT command acknowledgment from hardware
func (h *APIHandler) ProcessCommandAck(deviceID string, payloadData []byte) error {
	var ack struct {
		CommandID string `json:"command_id"`
		DeviceID  string `json:"device_id"`
		Status    string `json:"status"`
		Result    string `json:"result"`
	}
	if err := json.Unmarshal(payloadData, &ack); err != nil {
		return err
	}
	if ack.DeviceID == "" {
		ack.DeviceID = deviceID
	}
	now := time.Now().UTC()

	h.mu.Lock()
	if cmd, exists := h.memCommands[ack.CommandID]; exists {
		cmd.Status = "ACKNOWLEDGED"
		if ack.Status != "" {
			cmd.Status = ack.Status
		}
		cmd.Response = ack.Result
		cmd.AckAt = &now
		h.memCommands[ack.CommandID] = cmd
	}
	h.mu.Unlock()

	if h.isDBReady() && ack.CommandID != "" {
		_, _ = h.DB.Exec(`
			UPDATE device_commands 
			SET status = $1, response = $2, ack_at = $3
			WHERE id = $4;
		`, ack.Status, ack.Result, now, ack.CommandID)
	}

	if h.sseBroker != nil {
		h.sseBroker.Broadcast("command_ack", map[string]interface{}{
			"command_id": ack.CommandID,
			"device_id":  ack.DeviceID,
			"status":     ack.Status,
			"result":     ack.Result,
			"ack_at":     now,
		})
	}

	return nil
}

// AcknowledgeCommandHTTP handles POST /api/v1/devices/{id}/command_ack
func (h *APIHandler) AcknowledgeCommandHTTP(w http.ResponseWriter, r *http.Request) {
	deviceID := r.PathValue("id")
	if deviceID == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
	}
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil || len(bodyBytes) == 0 {
		writeError(w, http.StatusBadRequest, "Invalid or empty request body")
		return
	}
	defer r.Body.Close()

	if err := h.ProcessCommandAck(deviceID, bodyBytes); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("Failed processing acknowledgment: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Command acknowledgment registered",
	})
}

// ProcessDeviceStatus updates device online/offline status in memory, in TimescaleDB, and broadcasts via SSE.
func (h *APIHandler) ProcessDeviceStatus(tenantID, deviceID, status string) error {
	if deviceID == "" {
		return fmt.Errorf("device_id is required")
	}

	status = strings.ToLower(strings.TrimSpace(status))
	if status != "online" && status != "offline" {
		status = "offline"
	}
	now := time.Now().UTC()

	h.mu.Lock()
	dev, exists := h.memDevices[deviceID]
	if exists {
		dev.Status = status
		dev.UpdatedAt = now
		h.memDevices[deviceID] = dev
	}
	h.mu.Unlock()

	if h.isDBReady() {
		_, _ = h.DB.Exec(`
			UPDATE devices
			SET status = $1, updated_at = $2
			WHERE device_id = $3 OR id::text = $3;
		`, status, now, deviceID)
	}

	if h.sseBroker != nil {
		h.sseBroker.Broadcast("device_status", map[string]interface{}{
			"device_id":  deviceID,
			"status":     status,
			"updated_at": now.Format(time.RFC3339),
		})
	}

	return nil
}

// CheckStaleDevices marks devices as offline if they have not sent telemetry for timeout.
func (h *APIHandler) CheckStaleDevices(timeout time.Duration) (int, error) {
	now := time.Now().UTC()
	cutoff := now.Add(-timeout)
	staleDeviceIDs := make([]string, 0)

	if h.isDBReady() {
		rows, err := h.DB.Query(`
			SELECT device_id
			FROM devices
			WHERE status = 'online' AND updated_at < $1;
		`, cutoff)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var devID string
				if err := rows.Scan(&devID); err == nil {
					staleDeviceIDs = append(staleDeviceIDs, devID)
				}
			}
		}
	} else {
		h.mu.RLock()
		for id, dev := range h.memDevices {
			if dev.Status == "online" && dev.UpdatedAt.Before(cutoff) {
				staleDeviceIDs = append(staleDeviceIDs, id)
			}
		}
		h.mu.RUnlock()
	}

	for _, devID := range staleDeviceIDs {
		_ = h.ProcessDeviceStatus("", devID, "offline")
		log.Printf("[HEARTBEAT] Device %s marked offline (no telemetry for >%v)", devID, timeout)
	}

	return len(staleDeviceIDs), nil
}

// SendCommand handles POST /api/v1/devices/{id}/commands
// Publishes downlink actuation commands to MQTT (devices/{id}/commands) and logs the command.
func (h *APIHandler) SendCommand(w http.ResponseWriter, r *http.Request) {
	deviceID := r.PathValue("id")
	if deviceID == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
	}

	var req struct {
		Action  string          `json:"action"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if strings.TrimSpace(req.Action) == "" {
		writeError(w, http.StatusBadRequest, "Command 'action' is required (e.g. set_relay, toggle_led, set_interval, reboot, calibrate)")
		return
	}

	b := make([]byte, 8)
	_, _ = rand.Read(b)
	cmdID := fmt.Sprintf("cmd-%x", b)
	now := time.Now().UTC()

	cmd := models.DeviceCommand{
		ID:       cmdID,
		DeviceID: deviceID,
		Action:   req.Action,
		Payload:  req.Payload,
		Status:   "SENT",
		SentAt:   now,
	}

	h.mu.RLock()
	if dev, ok := h.memDevices[deviceID]; ok {
		cmd.TenantID = dev.TenantID
	}
	h.mu.RUnlock()

	h.mu.Lock()
	h.memCommands[cmdID] = cmd
	h.mu.Unlock()

	if h.isDBReady() {
		_, _ = h.DB.Exec(`
			INSERT INTO device_commands (id, device_id, tenant_id, action, payload, status, sent_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7);
		`, cmd.ID, cmd.DeviceID, cmd.TenantID, cmd.Action, cmd.Payload, cmd.Status, cmd.SentAt)
	}

	// Dispatch downlink via MQTT
	mqttPayload, _ := json.Marshal(map[string]interface{}{
		"command_id": cmd.ID,
		"device_id":  cmd.DeviceID,
		"action":     cmd.Action,
		"payload":    cmd.Payload,
		"sent_at":    cmd.SentAt,
	})

	if h.mqttPub != nil {
		if err := h.mqttPub.PublishCommand(deviceID, mqttPayload); err != nil {
			log.Printf("[MQTT] Notice: Command published locally (%v)", err)
		}
	}

	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"status":  "success",
		"message": fmt.Sprintf("Downlink command '%s' dispatched to %s", cmd.Action, cmd.DeviceID),
		"command": cmd,
	})
}

// GetDeviceCommands handles GET /api/v1/devices/{id}/commands
func (h *APIHandler) GetDeviceCommands(w http.ResponseWriter, r *http.Request) {
	deviceID := r.PathValue("id")
	if deviceID == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
	}

	if h.isDBReady() {
		rows, err := h.DB.Query(`
			SELECT id, device_id, COALESCE(tenant_id, ''), action, COALESCE(payload, '{}'::jsonb), status, COALESCE(response, ''), sent_at, ack_at
			FROM device_commands
			WHERE device_id = $1
			ORDER BY sent_at DESC
			LIMIT 50;
		`, deviceID)
		if err == nil {
			defer rows.Close()
			cmds := make([]models.DeviceCommand, 0)
			for rows.Next() {
				var c models.DeviceCommand
				var pBytes []byte
				if err := rows.Scan(&c.ID, &c.DeviceID, &c.TenantID, &c.Action, &pBytes, &c.Status, &c.Response, &c.SentAt, &c.AckAt); err == nil {
					c.Payload = json.RawMessage(pBytes)
					cmds = append(cmds, c)
				}
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"count":    len(cmds),
				"commands": cmds,
			})
			return
		}
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	cmds := make([]models.DeviceCommand, 0)
	for _, c := range h.memCommands {
		if c.DeviceID == deviceID {
			cmds = append(cmds, c)
		}
	}
	sort.Slice(cmds, func(i, j int) bool {
		return cmds[i].SentAt.After(cmds[j].SentAt)
	})
	if len(cmds) > 50 {
		cmds = cmds[:50]
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":    len(cmds),
		"commands": cmds,
	})
}

// evaluateCondition dynamically checks the rule operator and threshold against a numerical value.
// Never uses hardcoded threshold or if logic!
func evaluateCondition(val float64, op string, threshold float64) bool {
	switch op {
	case ">":
		return val > threshold
	case ">=":
		return val >= threshold
	case "<":
		return val < threshold
	case "<=":
		return val <= threshold
	case "==":
		return val == threshold
	case "!=":
		return val != threshold
	default:
		return false
	}
}

// extractFloat extracts a float64 from a generic map, supporting nested payloads and various number formats.
func extractFloat(data map[string]interface{}, field string) (float64, bool) {
	if v, exists := data[field]; exists {
		switch num := v.(type) {
		case float64:
			return num, true
		case float32:
			return float64(num), true
		case int:
			return float64(num), true
		case int64:
			return float64(num), true
		}
	}

	if nested, ok := data["payload"].(map[string]interface{}); ok {
		return extractFloat(nested, field)
	}

	return 0, false
}

// evaluateRules evaluates incoming telemetry against dynamic JSON-defined guardrails.
func (h *APIHandler) evaluateRules(tenantID, deviceID string, payloadData []byte) {
	var rawMap map[string]interface{}
	if err := json.Unmarshal(payloadData, &rawMap); err != nil {
		return
	}

	// 1. Fetch active rules
	var activeRules []models.Rule
	if h.isDBReady() {
		rows, err := h.DB.Query(`
			SELECT id, tenant_id, name, COALESCE(description, ''), COALESCE(device_id, ''),
			       field, operator, threshold, severity, enabled, created_at, updated_at
			FROM rules
			WHERE tenant_id = $1 AND enabled = TRUE
		`, tenantID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var r models.Rule
				if err := rows.Scan(&r.ID, &r.TenantID, &r.Name, &r.Description, &r.DeviceID,
					&r.Field, &r.Operator, &r.Threshold, &r.Severity, &r.Enabled, &r.CreatedAt, &r.UpdatedAt); err == nil {
					activeRules = append(activeRules, r)
				}
			}
		}
	}

	if len(activeRules) == 0 {
		h.mu.RLock()
		for _, r := range h.memRules {
			if r.Enabled && (r.TenantID == tenantID || r.TenantID == "a0000000-0000-0000-0000-000000000001") {
				activeRules = append(activeRules, r)
			}
		}
		h.mu.RUnlock()
	}

	now := time.Now().UTC()

	// 2. Dynamic evaluation per rule
	for _, rule := range activeRules {
		if rule.DeviceID != "" && rule.DeviceID != deviceID {
			continue
		}

		val, found := extractFloat(rawMap, rule.Field)
		if !found {
			continue
		}

		triggered := evaluateCondition(val, rule.Operator, rule.Threshold)
		alarmKey := fmt.Sprintf("%s:%s", rule.ID, deviceID)

		if triggered {
			h.mu.Lock()
			existing, exists := h.memAlarms[alarmKey]
			if !exists || existing.Status == "RESOLVED" {
				alarmID := fmt.Sprintf("alarm-%s-%d", deviceID, now.UnixMilli())
				msg := fmt.Sprintf("Guardrail triggered: %s is %.1f (%s %.1f in rule '%s')",
					rule.Field, val, rule.Operator, rule.Threshold, rule.Name)
				newAlarm := models.Alarm{
					ID:           alarmID,
					TenantID:     tenantID,
					RuleID:       rule.ID,
					DeviceID:     deviceID,
					RuleName:     rule.Name,
					Severity:     rule.Severity,
					Status:       "OPEN",
					TriggerValue: val,
					Threshold:    rule.Threshold,
					Message:      msg,
					TriggeredAt:  now,
				}
				h.memAlarms[alarmKey] = newAlarm
				h.mu.Unlock()

				log.Printf("[GUARDRAIL ALARM] [OPEN] Device %s: %s", deviceID, msg)

				if h.sseBroker != nil {
					h.sseBroker.Broadcast("alarm", newAlarm)
				}

				// Dispatch automated outbound alert notifications (Slack / Discord / Webhook)
				h.DispatchAlarmNotification(newAlarm)

				if h.isDBReady() {
					_, _ = h.DB.Exec(`
						INSERT INTO alarms (id, tenant_id, rule_id, device_id, rule_name, severity, status, trigger_value, threshold, message, triggered_at)
						VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7, $8, $9, $10)
					`, alarmID, tenantID, rule.ID, deviceID, rule.Name, rule.Severity, val, rule.Threshold, msg, now)
				}
			} else {
				h.mu.Unlock()
			}
		} else {
			// Auto-resolve when reading normalizes
			h.mu.Lock()
			existing, exists := h.memAlarms[alarmKey]
			if exists && existing.Status == "OPEN" {
				existing.Status = "RESOLVED"
				existing.ResolvedAt = &now
				h.memAlarms[alarmKey] = existing
				h.mu.Unlock()

				log.Printf("[GUARDRAIL ALARM] [RESOLVED] Device %s: %s normalized to %.1f", deviceID, rule.Field, val)

				if h.sseBroker != nil {
					h.sseBroker.Broadcast("alarm", existing)
				}

				if h.isDBReady() {
					_, _ = h.DB.Exec(`
						UPDATE alarms
						SET status = 'RESOLVED', resolved_at = $1
						WHERE rule_id = $2 AND device_id = $3 AND status = 'OPEN'
					`, now, rule.ID, deviceID)
				}
			} else {
				h.mu.Unlock()
			}
		}
	}
}

// ----------------------------------------------------------------------------
// Authentication Handlers (JWT & User Profiles)
// ----------------------------------------------------------------------------

// Register handles POST /api/v1/auth/register
func (h *APIHandler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	name := strings.TrimSpace(req.Name)
	mobile := strings.TrimSpace(req.Mobile)
	email := strings.ToLower(strings.TrimSpace(req.Email))
	username := strings.ToLower(strings.TrimSpace(req.Username))
	password := req.Password

	if name == "" {
		writeError(w, http.StatusBadRequest, "Full name is required")
		return
	}
	if mobile == "" || len(mobile) < 7 {
		writeError(w, http.StatusBadRequest, "Valid mobile number is required")
		return
	}
	if email == "" || !strings.Contains(email, "@") {
		writeError(w, http.StatusBadRequest, "Valid email address is required")
		return
	}
	if username == "" || len(username) < 3 {
		writeError(w, http.StatusBadRequest, "User ID / username must be at least 3 characters")
		return
	}
	if len(password) < 6 {
		writeError(w, http.StatusBadRequest, "Password must be at least 6 characters")
		return
	}

	// Check duplicates in database
	if h.isDBReady() {
		var exists int
		_ = h.DB.QueryRow("SELECT COUNT(*) FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $2", username, email).Scan(&exists)
		if exists > 0 {
			writeError(w, http.StatusConflict, "Username or Email is already registered")
			return
		}
	}

	// Check duplicates in memory
	h.mu.RLock()
	for _, u := range h.memUsers {
		if strings.ToLower(u.Username) == username || strings.ToLower(u.Email) == email {
			h.mu.RUnlock()
			writeError(w, http.StatusConflict, "Username or Email is already registered")
			return
		}
	}
	h.mu.RUnlock()

	hashBytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	now := time.Now().UTC()
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	userID := fmt.Sprintf("usr-%x", b)

	user := models.User{
		ID:           userID,
		Username:     username,
		Name:         name,
		Email:        email,
		Mobile:       mobile,
		PasswordHash: string(hashBytes),
		Role:         "user",
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	h.mu.Lock()
	h.memUsers[userID] = user
	h.mu.Unlock()

	if h.isDBReady() {
		_, err := h.DB.Exec(`
			INSERT INTO users (id, username, name, email, mobile, password_hash, role, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
		`, user.ID, user.Username, user.Name, user.Email, user.Mobile, user.PasswordHash, user.Role, now, now)
		if err != nil {
			log.Printf("[DB] Error inserting user: %v", err)
		}
	}

	token, exp, err := h.GenerateJWT(user, "", 24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to generate authentication token")
		return
	}

	writeJSON(w, http.StatusCreated, models.LoginResponse{
		Status:    "success",
		Token:     token,
		ExpiresAt: exp,
		User:      user,
	})
}

// Login handles POST /api/v1/auth/login
// Users can log in with User ID (username) OR Email, and password.
func (h *APIHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Enforce IP-based rate limiting on authentication attempts
	if h.loginLimiter != nil {
		clientIP := getClientIP(r)
		if !h.loginLimiter.allow(clientIP) {
			writeError(w, http.StatusTooManyRequests, "Too many login attempts. Please wait 1 minute before trying again.")
			return
		}
	}

	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	loginID := strings.TrimSpace(req.Username)
	password := req.Password

	if loginID == "" || password == "" {
		writeError(w, http.StatusBadRequest, "User ID and password are required")
		return
	}

	var user *models.User

	// 1. Direct check for configured Admin
	if (strings.EqualFold(loginID, h.AdminUsername) || strings.EqualFold(loginID, "admin@iot-platform.local")) && password == h.AdminPassword {
		user = &models.User{
			ID:        "usr-admin-system-001",
			Username:  h.AdminUsername,
			Name:      "System Administrator",
			Email:     "admin@iot-platform.local",
			Mobile:    "+1-555-0100",
			Role:      "admin",
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
		}
	}

	// 2. Database lookup
	if user == nil && h.isDBReady() {
		var u models.User
		query := `
			SELECT id, username, name, email, mobile, password_hash, role, created_at, updated_at
			FROM users
			WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)
			LIMIT 1;
		`
		err := h.DB.QueryRow(query, loginID).Scan(
			&u.ID, &u.Username, &u.Name, &u.Email, &u.Mobile, &u.PasswordHash, &u.Role, &u.CreatedAt, &u.UpdatedAt,
		)
		if err == nil {
			if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) == nil || (u.Username == h.AdminUsername && password == h.AdminPassword) {
				user = &u
			}
		}
	}

	// 3. In-memory lookup
	if user == nil {
		h.mu.RLock()
		for _, u := range h.memUsers {
			if strings.EqualFold(u.Username, loginID) || strings.EqualFold(u.Email, loginID) {
				if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) == nil || (u.Username == h.AdminUsername && password == h.AdminPassword) {
					userCopy := u
					user = &userCopy
				}
				break
			}
		}
		h.mu.RUnlock()
	}

	if user == nil {
		writeError(w, http.StatusUnauthorized, "Invalid user ID or password")
		return
	}

	// Determine primary tenant for JWT
	tenantID := "a0000000-0000-0000-0000-000000000001"
	if h.isDBReady() {
		var tid string
		err := h.DB.QueryRow("SELECT id FROM tenants WHERE owner_id = $1 ORDER BY created_at ASC LIMIT 1;", user.ID).Scan(&tid)
		if err == nil && tid != "" {
			tenantID = tid
		}
	} else {
		h.mu.RLock()
		for _, t := range h.memTenants {
			if t.OwnerID == user.ID {
				tenantID = t.ID
				break
			}
		}
		h.mu.RUnlock()
	}

	token, expiresAt, err := h.GenerateJWT(*user, tenantID, 24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to generate JWT token")
		return
	}

	writeJSON(w, http.StatusOK, models.LoginResponse{
		Status:    "success",
		Token:     token,
		ExpiresAt: expiresAt,
		User:      *user,
	})
}

// GetMe handles GET /api/v1/auth/me
func (h *APIHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var user *models.User
	if h.isDBReady() {
		var u models.User
		err := h.DB.QueryRow(`
			SELECT id, username, name, email, mobile, role, created_at, updated_at
			FROM users
			WHERE id = $1 OR LOWER(username) = LOWER($2)
			LIMIT 1;
		`, caller.UserID, caller.Username).Scan(
			&u.ID, &u.Username, &u.Name, &u.Email, &u.Mobile, &u.Role, &u.CreatedAt, &u.UpdatedAt,
		)
		if err == nil {
			user = &u
		}
	}

	if user == nil {
		h.mu.RLock()
		for _, u := range h.memUsers {
			if u.ID == caller.UserID || strings.EqualFold(u.Username, caller.Username) {
				userCopy := u
				user = &userCopy
				break
			}
		}
		h.mu.RUnlock()
	}

	if user == nil {
		user = &models.User{
			ID:        caller.UserID,
			Username:  caller.Username,
			Name:      caller.Name,
			Email:     caller.Email,
			Role:      caller.Role,
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "authenticated",
		"user":   user,
	})
}

// GetUsers handles GET /api/v1/users (Admin only)
func (h *APIHandler) GetUsers(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil || caller.Role != "admin" {
		writeError(w, http.StatusForbidden, "Forbidden: administrator privileges required")
		return
	}

	usersList := make([]models.User, 0)

	if h.isDBReady() {
		query := `
			SELECT u.id, u.username, u.name, u.email, u.mobile, u.role, u.created_at, u.updated_at,
			       COUNT(t.id) AS workspaces_count
			FROM users u
			LEFT JOIN tenants t ON t.owner_id = u.id
			GROUP BY u.id, u.username, u.name, u.email, u.mobile, u.role, u.created_at, u.updated_at
			ORDER BY u.created_at ASC;
		`
		rows, err := h.DB.Query(query)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var u models.User
				if err := rows.Scan(&u.ID, &u.Username, &u.Name, &u.Email, &u.Mobile, &u.Role, &u.CreatedAt, &u.UpdatedAt, &u.WorkspacesCount); err == nil {
					usersList = append(usersList, u)
				}
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"count": len(usersList),
				"users": usersList,
			})
			return
		}
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, u := range h.memUsers {
		count := 0
		for _, t := range h.memTenants {
			if t.OwnerID == u.ID {
				count++
			}
		}
		u.WorkspacesCount = count
		usersList = append(usersList, u)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count": len(usersList),
		"users": usersList,
	})
}

// DeleteUser handles DELETE /api/v1/users/{id} (Admin Only)
func (h *APIHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil || caller.Role != "admin" {
		writeError(w, http.StatusForbidden, "Forbidden: administrator privileges required")
		return
	}

	userID := r.PathValue("id")
	if userID == "" {
		writeError(w, http.StatusBadRequest, "User ID is required in URL path")
		return
	}

	// Prevent admin from deleting themselves or the primary system admin
	if userID == "usr-admin-system-001" || userID == caller.UserID || userID == caller.Username || userID == h.AdminUsername {
		writeError(w, http.StatusBadRequest, "Cannot delete primary administrator account or active session")
		return
	}

	h.mu.Lock()
	userToDelete, existsInMem := h.memUsers[userID]
	if !existsInMem && !h.isDBReady() {
		for uid, u := range h.memUsers {
			if u.Username == userID {
				userToDelete = u
				userID = uid
				existsInMem = true
				break
			}
		}
	}

	if existsInMem {
		if userToDelete.Role == "admin" || userToDelete.Username == h.AdminUsername {
			h.mu.Unlock()
			writeError(w, http.StatusBadRequest, "Cannot delete administrator accounts")
			return
		}
		delete(h.memUsers, userID)

		// Delete all workspaces owned by this user
		tenantsToDelete := make([]string, 0)
		for tid, t := range h.memTenants {
			if t.OwnerID == userID || t.OwnerID == userToDelete.Username {
				tenantsToDelete = append(tenantsToDelete, tid)
			}
		}

		for _, tid := range tenantsToDelete {
			delete(h.memTenants, tid)
			for devId, dev := range h.memDevices {
				if dev.TenantID == tid {
					delete(h.memDevices, devId)
					delete(h.memLatest, devId)
					delete(h.memHistory, devId)
				}
			}
			for chanId, ch := range h.memChannels {
				if ch.TenantID == tid {
					delete(h.memChannels, chanId)
				}
			}
			for rId, r := range h.memRules {
				if r.TenantID == tid {
					delete(h.memRules, rId)
				}
			}
			for aId, a := range h.memAlarms {
				if a.TenantID == tid {
					delete(h.memAlarms, aId)
				}
			}
		}
	}
	h.mu.Unlock()

	if h.isDBReady() {
		var role, username string
		err := h.DB.QueryRow("SELECT role, username FROM users WHERE id = $1 OR username = $1", userID).Scan(&role, &username)
		if err == nil {
			if role == "admin" || username == h.AdminUsername {
				writeError(w, http.StatusBadRequest, "Cannot delete administrator accounts")
				return
			}
			// Delete user's tenants (which cascades to channels, devices, telemetry, etc.)
			_, _ = h.DB.Exec("DELETE FROM tenants WHERE owner_id = $1 OR owner_id = $2", userID, username)
			// Delete user row
			_, _ = h.DB.Exec("DELETE FROM users WHERE id = $1 OR username = $1", userID)
		} else if !existsInMem {
			writeError(w, http.StatusNotFound, "User not found")
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "User and associated resources removed successfully",
		"id":      userID,
	})
}

// ----------------------------------------------------------------------------
// Rules Handlers (Guardrail Thresholds)
// ----------------------------------------------------------------------------

// GetRules handles GET /api/v1/rules
func (h *APIHandler) GetRules(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized: authentication required to view guardrail rules")
		return
	}
	tenantID := strings.TrimSpace(r.URL.Query().Get("tenant_id"))
	if caller.Role != "admin" {
		if tenantID != "" && !h.userOwnsTenant(caller, tenantID) {
			writeError(w, http.StatusForbidden, "Forbidden: you do not have permission to view rules for this workspace")
			return
		}
		if tenantID == "" {
			userTenants := h.getUserTenantIDs(caller)
			if len(userTenants) > 0 {
				tenantID = userTenants[0]
			}
		}
	}
	if tenantID == "" {
		tenantID = "a0000000-0000-0000-0000-000000000001"
	}

	if h.isDBReady() {
		rows, err := h.DB.Query(`
			SELECT id, tenant_id, name, COALESCE(description, ''), COALESCE(device_id, ''),
			       field, operator, threshold, severity, enabled, created_at, updated_at
			FROM rules
			WHERE tenant_id = $1
			ORDER BY created_at DESC;
		`, tenantID)
		if err == nil {
			defer rows.Close()
			rules := make([]models.Rule, 0)
			for rows.Next() {
				var ru models.Rule
				if err := rows.Scan(&ru.ID, &ru.TenantID, &ru.Name, &ru.Description, &ru.DeviceID,
					&ru.Field, &ru.Operator, &ru.Threshold, &ru.Severity, &ru.Enabled, &ru.CreatedAt, &ru.UpdatedAt); err == nil {
					rules = append(rules, ru)
				}
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"rules": rules,
				"count": len(rules),
			})
			return
		}
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	rules := make([]models.Rule, 0)
	for _, ru := range h.memRules {
		if ru.TenantID == tenantID || tenantID == "" || ru.TenantID == "a0000000-0000-0000-0000-000000000001" {
			rules = append(rules, ru)
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"rules": rules,
		"count": len(rules),
	})
}

// CreateRule handles POST /api/v1/rules
func (h *APIHandler) CreateRule(w http.ResponseWriter, r *http.Request) {
	var ru models.Rule
	if err := json.NewDecoder(r.Body).Decode(&ru); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if ru.Name == "" || ru.Field == "" || ru.Operator == "" {
		writeError(w, http.StatusBadRequest, "Missing required rule parameters: name, field, operator")
		return
	}

	if ru.ID == "" {
		ru.ID = fmt.Sprintf("rule-%s-%d", ru.Field, time.Now().UnixMilli())
	}
	if ru.TenantID == "" {
		ru.TenantID = "a0000000-0000-0000-0000-000000000001"
	}
	if ru.Severity == "" {
		ru.Severity = "CRITICAL"
	}
	now := time.Now().UTC()
	ru.CreatedAt = now
	ru.UpdatedAt = now
	ru.Enabled = true

	h.mu.Lock()
	h.memRules[ru.ID] = ru
	h.mu.Unlock()

	if h.isDBReady() {
		_, err := h.DB.Exec(`
			INSERT INTO rules (id, tenant_id, name, description, device_id, field, operator, threshold, severity, enabled, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				description = EXCLUDED.description,
				field = EXCLUDED.field,
				operator = EXCLUDED.operator,
				threshold = EXCLUDED.threshold,
				severity = EXCLUDED.severity,
				updated_at = NOW();
		`, ru.ID, ru.TenantID, ru.Name, ru.Description, ru.DeviceID, ru.Field, ru.Operator, ru.Threshold, ru.Severity, ru.Enabled, now, now)
		if err != nil {
			log.Printf("[DB] Error saving rule: %v", err)
		}
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"status": "success",
		"rule":   ru,
	})
}

// DeleteRule handles DELETE /api/v1/rules/{id}
func (h *APIHandler) DeleteRule(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Rule ID is required")
		return
	}

	h.mu.Lock()
	delete(h.memRules, id)
	h.mu.Unlock()

	if h.isDBReady() {
		_, _ = h.DB.Exec("DELETE FROM rules WHERE id = $1", id)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"id":      id,
		"message": "Rule deleted successfully",
	})
}

// ----------------------------------------------------------------------------
// Alarms Handlers
// ----------------------------------------------------------------------------

// GetAlarms handles GET /api/v1/alarms
func (h *APIHandler) GetAlarms(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized: authentication required to view alarms")
		return
	}
	tenantID := strings.TrimSpace(r.URL.Query().Get("tenant_id"))
	statusFilter := r.URL.Query().Get("status")
	deviceID := r.URL.Query().Get("device_id")

	if caller.Role != "admin" {
		if tenantID != "" && !h.userOwnsTenant(caller, tenantID) {
			writeError(w, http.StatusForbidden, "Forbidden: you do not have permission to view alarms for this workspace")
			return
		}
		if tenantID == "" {
			userTenants := h.getUserTenantIDs(caller)
			if len(userTenants) > 0 {
				tenantID = userTenants[0]
			}
		}
	}

	if tenantID == "" {
		tenantID = "a0000000-0000-0000-0000-000000000001"
	}

	if h.isDBReady() {
		query := `
			SELECT id, tenant_id, COALESCE(rule_id, ''), device_id, rule_name, severity, status,
			       trigger_value, threshold, message, triggered_at, resolved_at
			FROM alarms
			WHERE tenant_id = $1
			  AND ($2 = '' OR status = $2)
			  AND ($3 = '' OR device_id = $3)
			ORDER BY triggered_at DESC
			LIMIT 100;
		`
		rows, err := h.DB.Query(query, tenantID, statusFilter, deviceID)
		if err == nil {
			defer rows.Close()
			alarms := make([]models.Alarm, 0)
			for rows.Next() {
				var al models.Alarm
				if err := rows.Scan(&al.ID, &al.TenantID, &al.RuleID, &al.DeviceID, &al.RuleName,
					&al.Severity, &al.Status, &al.TriggerValue, &al.Threshold, &al.Message,
					&al.TriggeredAt, &al.ResolvedAt); err == nil {
					alarms = append(alarms, al)
				}
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"alarms": alarms,
				"count":  len(alarms),
			})
			return
		}
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	alarms := make([]models.Alarm, 0)
	for _, al := range h.memAlarms {
		if (tenantID == "" || al.TenantID == tenantID || al.TenantID == "a0000000-0000-0000-0000-000000000001") &&
			(statusFilter == "" || al.Status == statusFilter) &&
			(deviceID == "" || al.DeviceID == deviceID) {
			alarms = append(alarms, al)
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"alarms": alarms,
		"count":  len(alarms),
	})
}

// AcknowledgeAlarm handles POST /api/v1/alarms/{id}/acknowledge
func (h *APIHandler) AcknowledgeAlarm(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Alarm ID is required")
		return
	}

	h.mu.Lock()
	for key, al := range h.memAlarms {
		if al.ID == id {
			al.Status = "ACKNOWLEDGED"
			h.memAlarms[key] = al
			break
		}
	}
	h.mu.Unlock()

	if h.isDBReady() {
		_, _ = h.DB.Exec("UPDATE alarms SET status = 'ACKNOWLEDGED' WHERE id = $1", id)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"id":      id,
		"message": "Alarm acknowledged successfully",
	})
}

// ResolveAlarm handles POST /api/v1/alarms/{id}/resolve
func (h *APIHandler) ResolveAlarm(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Alarm ID is required")
		return
	}

	now := time.Now().UTC()
	h.mu.Lock()
	for key, al := range h.memAlarms {
		if al.ID == id {
			al.Status = "RESOLVED"
			al.ResolvedAt = &now
			h.memAlarms[key] = al
			break
		}
	}
	h.mu.Unlock()

	if h.isDBReady() {
		_, _ = h.DB.Exec("UPDATE alarms SET status = 'RESOLVED', resolved_at = $1 WHERE id = $2", now, id)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"id":      id,
		"message": "Alarm resolved successfully",
	})
}

// DeleteAlarm handles DELETE /api/v1/alarms/{id}
func (h *APIHandler) DeleteAlarm(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Alarm ID is required")
		return
	}

	h.mu.Lock()
	for key, al := range h.memAlarms {
		if al.ID == id {
			delete(h.memAlarms, key)
			break
		}
	}
	h.mu.Unlock()

	if h.isDBReady() {
		_, _ = h.DB.Exec("DELETE FROM alarms WHERE id = $1", id)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"id":      id,
		"message": "Alarm record deleted",
	})
}
