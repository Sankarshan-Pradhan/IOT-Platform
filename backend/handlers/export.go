package handlers

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"iot-backend/backend/models"
)

// ExportTelemetry handles GET /api/v1/devices/{id}/telemetry/export?format=csv|json&limit=5000
// Streams historical telemetry as downloadable CSV or JSON attachments for data reporting & audits.
func (h *APIHandler) ExportTelemetry(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
	}

	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format == "" {
		format = "csv"
	}
	if format != "csv" && format != "json" {
		writeError(w, http.StatusBadRequest, "Invalid format. Supported formats: csv, json")
		return
	}

	limit := 5000
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 {
			if parsed > 50000 {
				limit = 50000
			} else {
				limit = parsed
			}
		}
	}

	var startTime, endTime *time.Time
	if startStr := r.URL.Query().Get("start"); startStr != "" {
		if t, err := time.Parse(time.RFC3339, startStr); err == nil {
			startTime = &t
		}
	}
	if endStr := r.URL.Query().Get("end"); endStr != "" {
		if t, err := time.Parse(time.RFC3339, endStr); err == nil {
			endTime = &t
		}
	}

	var records []models.TelemetryRecord

	if h.isDBReady() {
		device, err := h.resolveDevice(id)
		if err == nil {
			query := `
				SELECT time, tenant_id, device_id, payload, created_at
				FROM telemetry
				WHERE tenant_id = $1 AND device_id = $2
				  AND ($3::timestamptz IS NULL OR time >= $3)
				  AND ($4::timestamptz IS NULL OR time <= $4)
				ORDER BY time ASC
				LIMIT $5;
			`
			rows, qErr := h.DB.Query(query, device.TenantID, device.DeviceID, startTime, endTime, limit)
			if qErr == nil {
				defer rows.Close()
				records = make([]models.TelemetryRecord, 0)
				for rows.Next() {
					var tr models.TelemetryRecord
					var payloadBytes []byte
					if err := rows.Scan(&tr.Time, &tr.TenantID, &tr.DeviceID, &payloadBytes, &tr.CreatedAt); err == nil {
						tr.Payload = json.RawMessage(payloadBytes)
						records = append(records, tr)
					}
				}
			}
		}
	}

	// Fallback to in-memory records if DB offline or empty
	if records == nil {
		h.mu.RLock()
		memList := h.memHistory[id]
		if memList == nil {
			memList = make([]models.TelemetryRecord, 0)
		}
		if len(memList) > limit {
			records = append([]models.TelemetryRecord(nil), memList[len(memList)-limit:]...)
		} else {
			records = append([]models.TelemetryRecord(nil), memList...)
		}
		h.mu.RUnlock()
	}

	timestampStr := time.Now().UTC().Format("20060102_150405")

	if format == "json" {
		fileName := fmt.Sprintf("telemetry_%s_%s.json", id, timestampStr)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", fileName))
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(records)
		return
	}

	// Format CSV
	fileName := fmt.Sprintf("telemetry_%s_%s.csv", id, timestampStr)
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", fileName))
	w.WriteHeader(http.StatusOK)

	csvWriter := csv.NewWriter(w)
	defer csvWriter.Flush()

	// Write CSV Header
	_ = csvWriter.Write([]string{
		"timestamp_iso8601",
		"tenant_id",
		"device_id",
		"temperature_c",
		"humidity_pct",
		"wifi_rssi",
		"raw_payload",
	})

	for _, rec := range records {
		var payloadMap map[string]interface{}
		_ = json.Unmarshal(rec.Payload, &payloadMap)

		tempStr := ""
		if t, ok := payloadMap["temperature_c"].(float64); ok {
			tempStr = fmt.Sprintf("%.2f", t)
		}

		humStr := ""
		if h, ok := payloadMap["humidity_pct"].(float64); ok {
			humStr = fmt.Sprintf("%.2f", h)
		}

		rssiStr := ""
		if r, ok := payloadMap["wifi_rssi"].(float64); ok {
			rssiStr = fmt.Sprintf("%.0f", r)
		}

		_ = csvWriter.Write([]string{
			rec.Time.UTC().Format(time.RFC3339),
			rec.TenantID,
			rec.DeviceID,
			tempStr,
			humStr,
			rssiStr,
			string(rec.Payload),
		})
	}
}
