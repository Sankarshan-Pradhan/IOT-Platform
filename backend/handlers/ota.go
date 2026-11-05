package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"iot-backend/backend/models"
)

const firmwareStorageDir = "./data/firmware"

// UploadFirmware handles POST /api/v1/ota/firmware
// Receives multi-part file binary upload, records metadata, and stores on disk.
func (h *APIHandler) UploadFirmware(w http.ResponseWriter, r *http.Request) {
	// 10 MB maximum upload size for ESP32 flash binaries
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("Failed to parse form: %v", err))
		return
	}

	file, header, err := r.FormFile("binary")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Missing 'binary' firmware file in form-data")
		return
	}
	defer file.Close()

	version := strings.TrimSpace(r.FormValue("version"))
	if version == "" {
		version = "1.0.1"
	}
	deviceType := strings.TrimSpace(r.FormValue("device_type"))
	if deviceType == "" {
		deviceType = "ESP32"
	}
	description := strings.TrimSpace(r.FormValue("description"))

	// Ensure destination directory exists
	if err := os.MkdirAll(firmwareStorageDir, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create firmware storage directory")
		return
	}

	safeFilename := fmt.Sprintf("%s_%s_%s", strings.ToLower(deviceType), version, filepath.Base(header.Filename))
	dstPath := filepath.Join(firmwareStorageDir, safeFilename)

	dstFile, err := os.Create(dstPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to store firmware: %v", err))
		return
	}
	defer dstFile.Close()

	hasher := sha256.New()
	multiWriter := io.MultiWriter(dstFile, hasher)

	written, err := io.Copy(multiWriter, file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to write firmware: %v", err))
		return
	}

	checksum := hex.EncodeToString(hasher.Sum(nil))
	firmwareID := fmt.Sprintf("fw-%s-%x", version, checksum[:8])

	fw := models.Firmware{
		ID:          firmwareID,
		Version:     version,
		DeviceType:  deviceType,
		Filename:    safeFilename,
		SizeBytes:   written,
		ChecksumSHA: checksum,
		Description: description,
		CreatedAt:   time.Now().UTC(),
	}

	h.mu.Lock()
	h.memFirmwares[fw.ID] = fw
	h.mu.Unlock()

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"status":   "success",
		"message":  "Firmware binary uploaded and verified successfully",
		"firmware": fw,
	})
}

// ListFirmwares handles GET /api/v1/ota/firmware
func (h *APIHandler) ListFirmwares(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	list := make([]models.Firmware, 0, len(h.memFirmwares))
	for _, f := range h.memFirmwares {
		list = append(list, f)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":     len(list),
		"firmwares": list,
	})
}

// GetFirmwareBinary handles GET /api/v1/ota/firmware/{filename}
// Serves raw application/octet-stream binary for direct ESP32 HTTPUpdate flashing.
func (h *APIHandler) GetFirmwareBinary(w http.ResponseWriter, r *http.Request) {
	filename := r.PathValue("filename")
	if filename == "" {
		writeError(w, http.StatusBadRequest, "Filename parameter is required")
		return
	}

	safeFilename := filepath.Clean(filepath.Base(filename))
	filePath := filepath.Join(firmwareStorageDir, safeFilename)

	fileInfo, err := os.Stat(filePath)
	if os.IsNotExist(err) {
		writeError(w, http.StatusNotFound, "Firmware binary not found")
		return
	}

	file, err := os.Open(filePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to read firmware file")
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", safeFilename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", fileInfo.Size()))

	http.ServeContent(w, r, safeFilename, fileInfo.ModTime(), file)
}

// TriggerDeviceOTA handles POST /api/v1/devices/{id}/ota
// Dispatches an OTA update command to the device via MQTT.
func (h *APIHandler) TriggerDeviceOTA(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Device ID is required in URL path")
		return
	}

	var req struct {
		Version     string `json:"version"`
		Filename    string `json:"filename"`
		FirmwareURL string `json:"firmware_url"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request JSON payload")
		return
	}

	if req.Version == "" {
		req.Version = "v1.1.0"
	}

	downloadURL := req.FirmwareURL
	if downloadURL == "" {
		host := r.Host
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		if req.Filename != "" {
			downloadURL = fmt.Sprintf("%s://%s/api/v1/ota/firmware/%s", scheme, host, req.Filename)
		} else {
			downloadURL = fmt.Sprintf("%s://%s/api/v1/ota/firmware/esp32_firmware_%s.bin", scheme, host, req.Version)
		}
	}

	payloadMap := map[string]interface{}{
		"url":     downloadURL,
		"version": req.Version,
	}
	payloadBytes, _ := json.Marshal(payloadMap)

	cmdID := fmt.Sprintf("cmd-ota-%d", time.Now().UnixNano()%1000000)
	now := time.Now().UTC()

	cmd := models.DeviceCommand{
		ID:        cmdID,
		DeviceID:  id,
		Action:    "ota_update",
		Payload:   payloadBytes,
		Status:    "PENDING",
		Response:  "OTA firmware upgrade dispatched to device",
		SentAt:    now,
	}

	h.mu.Lock()
	h.memCommands[cmdID] = cmd
	// Pre-update firmware version on device
	if dev, ok := h.memDevices[id]; ok {
		dev.FirmwareVersion = fmt.Sprintf("%s (flashing...)", req.Version)
		dev.UpdatedAt = now
		h.memDevices[id] = dev
	}
	h.mu.Unlock()

	if h.isDBReady() {
		_, _ = h.DB.Exec(`
			INSERT INTO device_commands (id, device_id, action, payload, status, response, sent_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7);
		`, cmd.ID, cmd.DeviceID, cmd.Action, cmd.Payload, cmd.Status, cmd.Response, cmd.SentAt)

		_, _ = h.DB.Exec("UPDATE devices SET firmware_version = $1, updated_at = NOW() WHERE device_id = $2 OR id::text = $2",
			fmt.Sprintf("%s (flashing...)", req.Version), id)
	}

	// Dispatch downlink via MQTT
	h.mu.RLock()
	pub := h.mqttPub
	h.mu.RUnlock()

	if pub != nil {
		mqttPayload, _ := json.Marshal(map[string]interface{}{
			"command_id": cmdID,
			"action":     "ota_update",
			"payload":    payloadMap,
			"timestamp":  now.Unix(),
		})
		_ = pub.PublishCommand(id, mqttPayload)
	}

	if h.sseBroker != nil {
		h.sseBroker.Broadcast("command_sent", cmd)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":      "success",
		"message":     fmt.Sprintf("OTA firmware upgrade command dispatched to device '%s'", id),
		"command_id":  cmdID,
		"target_version": req.Version,
		"firmware_url":   downloadURL,
	})
}
