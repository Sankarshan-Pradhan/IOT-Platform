package handlers

import (
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"iot-backend/backend/models"
)

type APIHandler struct {
	DB *sql.DB
}

func NewAPIHandler(db *sql.DB) *APIHandler {
	return &APIHandler{DB: db}
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// resolveDevice finds a device by either internal UUID or business device_id
func (h *APIHandler) resolveDevice(identifier string) (*models.Device, error) {
	query := `
		SELECT id, tenant_id, device_id, name, device_type, status, metadata, created_at, updated_at
		FROM devices
		WHERE id::text = $1 OR device_id = $1
		LIMIT 1;
	`
	var d models.Device
	var metadataBytes []byte

	err := h.DB.QueryRow(query, identifier).Scan(
		&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.DeviceType, &d.Status,
		&metadataBytes, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	d.Metadata = json.RawMessage(metadataBytes)
	return &d, nil
}

// GetDevices handles GET /api/v1/devices
func (h *APIHandler) GetDevices(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	status := r.URL.Query().Get("status")

	query := `
		SELECT id, tenant_id, device_id, name, device_type, status, metadata, created_at, updated_at
		FROM devices
		WHERE ($1 = '' OR tenant_id::text = $1)
		  AND ($2 = '' OR status = $2)
		ORDER BY created_at DESC;
	`

	rows, err := h.DB.Query(query, tenantID, status)
	if err != nil {
		log.Printf("[Error] Failed to query devices: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to fetch devices")
		return
	}
	defer rows.Close()

	devices := make([]models.Device, 0)
	for rows.Next() {
		var d models.Device
		var metadataBytes []byte
		if err := rows.Scan(
			&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.DeviceType, &d.Status,
			&metadataBytes, &d.CreatedAt, &d.UpdatedAt,
		); err != nil {
			log.Printf("[Error] Failed to scan device row: %v", err)
			continue
		}
		d.Metadata = json.RawMessage(metadataBytes)
		devices = append(devices, d)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":   len(devices),
		"devices": devices,
	})
}

// GetLatestTelemetry handles GET /api/v1/devices/{id}/telemetry/latest
func (h *APIHandler) GetLatestTelemetry(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
	}

	device, err := h.resolveDevice(id)
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "Device not found")
			return
		}
		log.Printf("[Error] Failed to resolve device %s: %v", id, err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}

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
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"device_id": device.DeviceID,
				"tenant_id": device.TenantID,
				"message":   "No telemetry recorded for this device yet",
				"latest":    nil,
			})
			return
		}
		log.Printf("[Error] Failed to query latest telemetry: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to fetch latest telemetry")
		return
	}

	lt.Payload = json.RawMessage(payloadBytes)
	writeJSON(w, http.StatusOK, lt)
}

// GetTelemetryHistory handles GET /api/v1/devices/{id}/telemetry/history
func (h *APIHandler) GetTelemetryHistory(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
	}

	device, err := h.resolveDevice(id)
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "Device not found")
			return
		}
		log.Printf("[Error] Failed to resolve device %s: %v", id, err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}

	// Parse query params
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

	query := `
		SELECT time, tenant_id, device_id, payload, created_at
		FROM telemetry
		WHERE tenant_id = $1 AND device_id = $2
		  AND ($3::timestamptz IS NULL OR time >= $3)
		  AND ($4::timestamptz IS NULL OR time <= $4)
		ORDER BY time ` + order + `
		LIMIT $5;
	`

	rows, err := h.DB.Query(query, device.TenantID, device.DeviceID, startTime, endTime, limit)
	if err != nil {
		log.Printf("[Error] Failed to query telemetry history: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to fetch telemetry history")
		return
	}
	defer rows.Close()

	records := make([]models.TelemetryRecord, 0)
	for rows.Next() {
		var tr models.TelemetryRecord
		var payloadBytes []byte
		if err := rows.Scan(&tr.Time, &tr.TenantID, &tr.DeviceID, &payloadBytes, &tr.CreatedAt); err != nil {
			log.Printf("[Error] Failed to scan telemetry row: %v", err)
			continue
		}
		tr.Payload = json.RawMessage(payloadBytes)
		records = append(records, tr)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"device_id": device.DeviceID,
		"tenant_id": device.TenantID,
		"count":     len(records),
		"history":   records,
	})
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

	device, err := h.resolveDevice(id)
	if err != nil {
		if err == sql.ErrNoRows {
			// Auto-register device with default tenant if it doesn't exist
			defaultTenantID := "a0000000-0000-0000-0000-000000000001"
			regQuery := `
				INSERT INTO devices (tenant_id, device_id, name, device_type, status)
				VALUES ($1, $2, $2, 'generic', 'online')
				ON CONFLICT (tenant_id, device_id) DO UPDATE SET status = 'online', updated_at = NOW()
				RETURNING id, tenant_id, device_id, name, device_type, status, metadata, created_at, updated_at;
			`
			device = &models.Device{}
			var metadataBytes []byte
			regErr := h.DB.QueryRow(regQuery, defaultTenantID, id).Scan(
				&device.ID, &device.TenantID, &device.DeviceID, &device.Name,
				&device.DeviceType, &device.Status, &metadataBytes, &device.CreatedAt, &device.UpdatedAt,
			)
			if regErr != nil {
				log.Printf("[Error] Auto-registering device %s failed: %v", id, regErr)
				writeError(w, http.StatusInternalServerError, "Failed to register device")
				return
			}
			device.Metadata = json.RawMessage(metadataBytes)
		} else {
			log.Printf("[Error] Resolving device %s failed: %v", id, err)
			writeError(w, http.StatusInternalServerError, "Database error")
			return
		}
	}

	// Flexible payload parser
	var rawObj map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &rawObj); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	telemetryTime := time.Now().UTC()
	var payloadData []byte

	// Check if body wraps payload: {"time": "...", "payload": {...}}
	if wrappedPayload, hasPayload := rawObj["payload"]; hasPayload {
		payloadData, _ = json.Marshal(wrappedPayload)
		if tStr, hasTime := rawObj["time"].(string); hasTime {
			if parsedT, err := time.Parse(time.RFC3339, tStr); err == nil {
				telemetryTime = parsedT
			}
		}
	} else {
		// The entire body is the sensor payload
		payloadData = bodyBytes
	}

	// Insert into telemetry table
	insertQuery := `
		INSERT INTO telemetry (time, tenant_id, device_id, payload)
		VALUES ($1, $2, $3, $4);
	`
	_, err = h.DB.Exec(insertQuery, telemetryTime, device.TenantID, device.DeviceID, payloadData)
	if err != nil {
		log.Printf("[Error] Failed to insert telemetry: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to persist telemetry")
		return
	}

	// Update device status to online
	_, _ = h.DB.Exec("UPDATE devices SET status = 'online', updated_at = NOW() WHERE id = $1", device.ID)

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"status":    "success",
		"message":   "Telemetry ingested successfully",
		"device_id": device.DeviceID,
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

	// Redirect to device ingestion logic
	device, err := h.resolveDevice(req.DeviceID)
	if err != nil {
		if err == sql.ErrNoRows {
			tenantID := req.TenantID
			if tenantID == "" {
				tenantID = "a0000000-0000-0000-0000-000000000001"
			}
			regQuery := `
				INSERT INTO devices (tenant_id, device_id, name, device_type, status)
				VALUES ($1, $2, $2, 'generic', 'online')
				ON CONFLICT (tenant_id, device_id) DO UPDATE SET status = 'online', updated_at = NOW()
				RETURNING id, tenant_id, device_id, name, device_type, status, metadata, created_at, updated_at;
			`
			device = &models.Device{}
			var metadataBytes []byte
			regErr := h.DB.QueryRow(regQuery, tenantID, req.DeviceID).Scan(
				&device.ID, &device.TenantID, &device.DeviceID, &device.Name,
				&device.DeviceType, &device.Status, &metadataBytes, &device.CreatedAt, &device.UpdatedAt,
			)
			if regErr != nil {
				log.Printf("[Error] Auto-registering device %s failed: %v", req.DeviceID, regErr)
				writeError(w, http.StatusInternalServerError, "Failed to register device")
				return
			}
			device.Metadata = json.RawMessage(metadataBytes)
		} else {
			writeError(w, http.StatusInternalServerError, "Database error")
			return
		}
	}

	telemetryTime := time.Now().UTC()
	if req.Time != nil {
		telemetryTime = req.Time.UTC()
	}

	payloadData := req.Payload
	if len(payloadData) == 0 {
		payloadData = []byte("{}")
	}

	insertQuery := `
		INSERT INTO telemetry (time, tenant_id, device_id, payload)
		VALUES ($1, $2, $3, $4);
	`
	_, err = h.DB.Exec(insertQuery, telemetryTime, device.TenantID, device.DeviceID, payloadData)
	if err != nil {
		log.Printf("[Error] Failed to insert telemetry: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to persist telemetry")
		return
	}

	_, _ = h.DB.Exec("UPDATE devices SET status = 'online', updated_at = NOW() WHERE id = $1", device.ID)

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"status":    "success",
		"message":   "Telemetry ingested successfully",
		"device_id": device.DeviceID,
		"time":      telemetryTime.Format(time.RFC3339Nano),
	})
}
