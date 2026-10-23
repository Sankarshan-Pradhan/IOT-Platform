package handlers

import (
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"iot-backend/backend/models"
)

type APIHandler struct {
	DB         *sql.DB
	mu         sync.RWMutex
	memDevices map[string]models.Device
	memLatest  map[string]models.LatestTelemetry
	memHistory map[string][]models.TelemetryRecord
}

func NewAPIHandler(db *sql.DB) *APIHandler {
	return &APIHandler{
		DB:         db,
		memDevices: make(map[string]models.Device),
		memLatest:  make(map[string]models.LatestTelemetry),
		memHistory: make(map[string][]models.TelemetryRecord),
	}
}

func (h *APIHandler) SetDB(db *sql.DB) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.DB = db
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

// resolveDevice finds a device by either internal UUID or business device_id
func (h *APIHandler) resolveDevice(identifier string) (*models.Device, error) {
	if h.isDBReady() {
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

// GetDevices handles GET /api/v1/devices
func (h *APIHandler) GetDevices(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	status := r.URL.Query().Get("status")

	if h.isDBReady() {
		query := `
			SELECT id, tenant_id, device_id, name, device_type, status, metadata, created_at, updated_at
			FROM devices
			WHERE ($1 = '' OR tenant_id::text = $1)
			  AND ($2 = '' OR status = $2)
			ORDER BY created_at DESC;
		`

		rows, err := h.DB.Query(query, tenantID, status)
		if err == nil {
			defer rows.Close()
			devices := make([]models.Device, 0)
			for rows.Next() {
				var d models.Device
				var metadataBytes []byte
				if err := rows.Scan(
					&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.DeviceType, &d.Status,
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
		if tenantID != "" && d.TenantID != tenantID {
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
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
	}

	if h.isDBReady() {
		device, err := h.resolveDevice(id)
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

// GetTelemetryHistory handles GET /api/v1/devices/{id}/telemetry/history
func (h *APIHandler) GetTelemetryHistory(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
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

			var query string
			if order == "ASC" {
				// Fetch the most recent N records and return them in ascending chronological order for charts
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

				writeJSON(w, http.StatusOK, map[string]interface{}{
					"device_id": device.DeviceID,
					"tenant_id": device.TenantID,
					"count":     len(records),
					"history":   records,
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

	if len(records) > limit {
		records = records[len(records)-limit:]
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"device_id": id,
		"tenant_id": "a0000000-0000-0000-0000-000000000001",
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

	var rawObj map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &rawObj); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	tenantID := "a0000000-0000-0000-0000-000000000001"
	if t, ok := rawObj["tenant_id"].(string); ok && t != "" {
		tenantID = t
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

	// 1. Update In-Memory cache
	h.mu.Lock()
	dev := models.Device{
		ID:         id,
		TenantID:   tenantID,
		DeviceID:   id,
		Name:       id,
		DeviceType: "ESP32",
		Status:     "online",
		Metadata:   json.RawMessage(`{}`),
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}
	h.memDevices[id] = dev

	lt := models.LatestTelemetry{
		TenantID:  tenantID,
		DeviceID:  id,
		Time:      telemetryTime,
		Payload:   json.RawMessage(payloadData),
		UpdatedAt: time.Now(),
	}
	h.memLatest[id] = lt

	record := models.TelemetryRecord{
		Time:      telemetryTime,
		TenantID:  tenantID,
		DeviceID:  id,
		Payload:   json.RawMessage(payloadData),
		CreatedAt: time.Now(),
	}
	h.memHistory[id] = append(h.memHistory[id], record)
	if len(h.memHistory[id]) > 500 {
		h.memHistory[id] = h.memHistory[id][len(h.memHistory[id])-500:]
	}
	h.mu.Unlock()

	// 2. Persist to TimescaleDB if connected
	if h.isDBReady() {
		_, _ = h.DB.Exec(`
			INSERT INTO tenants (id, name, slug)
			VALUES ($1, 'Workspace ' || SUBSTRING($1::text, 1, 8), 'workspace-' || SUBSTRING($1::text, 1, 8))
			ON CONFLICT (id) DO NOTHING;
		`, tenantID)

		regQuery := `
			INSERT INTO devices (tenant_id, device_id, name, device_type, status)
			VALUES ($1, $2, $2, 'ESP32', 'online')
			ON CONFLICT (tenant_id, device_id) DO UPDATE SET status = 'online', updated_at = NOW();
		`
		_, _ = h.DB.Exec(regQuery, tenantID, id)

		insertQuery := `
			INSERT INTO telemetry (time, tenant_id, device_id, payload)
			VALUES ($1, $2, $3, $4);
		`
		_, _ = h.DB.Exec(insertQuery, telemetryTime, tenantID, id, payloadData)
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
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
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
