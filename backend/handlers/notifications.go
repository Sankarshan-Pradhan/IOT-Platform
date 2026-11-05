package handlers

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"iot-backend/backend/models"
)

// NotificationChannel represents an alert destination (Slack, Discord, generic Webhook, Email)
type NotificationChannel struct {
	ID        string    `json:"id"`
	TenantID  string    `json:"tenant_id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"` // "webhook", "slack", "discord"
	TargetURL string    `json:"target_url"`
	Severity  string    `json:"severity"` // "CRITICAL", "ALL"
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// DispatchAlarmNotification fires outbound notifications asynchronously to all enabled alert channels
func (h *APIHandler) DispatchAlarmNotification(alarm models.Alarm) {
	go func() {
		h.mu.RLock()
		channels := make([]NotificationChannel, 0)
		for _, ch := range h.memNotificationChannels {
			if ch.Enabled && (ch.TenantID == alarm.TenantID || ch.TenantID == "" || ch.TenantID == "a0000000-0000-0000-0000-000000000001") {
				if ch.Severity == "ALL" || strings.EqualFold(ch.Severity, alarm.Severity) {
					channels = append(channels, ch)
				}
			}
		}
		h.mu.RUnlock()

		if len(channels) == 0 {
			return
		}

		client := &http.Client{Timeout: 5 * time.Second}

		for _, ch := range channels {
			if ch.TargetURL == "" {
				continue
			}

			// Format payload based on channel type
			var payloadBytes []byte
			switch ch.Type {
			case "discord":
				discordPayload := map[string]interface{}{
					"username": "IoT Platform Guardrail Bot",
					"content":  fmt.Sprintf("🚨 **[%s ALARM]** Device `%s`: %s\n> Rule: **%s** | Value: `%.1f` (Threshold: `%.1f`)", alarm.Severity, alarm.DeviceID, alarm.Message, alarm.RuleName, alarm.TriggerValue, alarm.Threshold),
				}
				payloadBytes, _ = json.Marshal(discordPayload)
			case "slack":
				slackPayload := map[string]interface{}{
					"text": fmt.Sprintf("🚨 *[%s ALARM]* Device `%s`: %s (Rule: *%s*)", alarm.Severity, alarm.DeviceID, alarm.Message, alarm.RuleName),
				}
				payloadBytes, _ = json.Marshal(slackPayload)
			default:
				// Generic Webhook
				webhookPayload := map[string]interface{}{
					"event":     "alarm.triggered",
					"severity":  alarm.Severity,
					"device_id": alarm.DeviceID,
					"rule_name": alarm.RuleName,
					"message":   alarm.Message,
					"value":     alarm.TriggerValue,
					"threshold": alarm.Threshold,
					"timestamp": alarm.TriggeredAt,
					"alarm":     alarm,
				}
				payloadBytes, _ = json.Marshal(webhookPayload)
			}

			req, err := http.NewRequest("POST", ch.TargetURL, bytes.NewBuffer(payloadBytes))
			if err != nil {
				continue
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("User-Agent", "IoT-Platform-Alert-Dispatcher/1.0")

			resp, err := client.Do(req)
			if err != nil {
				log.Printf("[ALERT DISPATCHER] Failed sending alert to %s (%s): %v", ch.Name, ch.TargetURL, err)
				continue
			}
			_ = resp.Body.Close()
			log.Printf("[ALERT DISPATCHER] Successfully dispatched %s alert to %s (%s, HTTP %d)", alarm.Severity, ch.Name, ch.Type, resp.StatusCode)
		}
	}()
}

// GetNotificationChannels handles GET /api/v1/notifications/channels
func (h *APIHandler) GetNotificationChannels(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")

	h.mu.RLock()
	defer h.mu.RUnlock()
	list := make([]NotificationChannel, 0)
	for _, ch := range h.memNotificationChannels {
		if tenantID == "" || ch.TenantID == tenantID || ch.TenantID == "" {
			list = append(list, ch)
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":    len(list),
		"channels": list,
	})
}

// CreateNotificationChannel handles POST /api/v1/notifications/channels
func (h *APIHandler) CreateNotificationChannel(w http.ResponseWriter, r *http.Request) {
	var ch NotificationChannel
	if err := json.NewDecoder(r.Body).Decode(&ch); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if strings.TrimSpace(ch.Name) == "" {
		writeError(w, http.StatusBadRequest, "'name' is required")
		return
	}
	if strings.TrimSpace(ch.TargetURL) == "" {
		writeError(w, http.StatusBadRequest, "'target_url' is required")
		return
	}
	if ch.Type == "" {
		ch.Type = "webhook"
	}
	if ch.Severity == "" {
		ch.Severity = "CRITICAL"
	}

	b := make([]byte, 8)
	_, _ = rand.Read(b)
	ch.ID = fmt.Sprintf("nc-%x", b)
	ch.Enabled = true
	ch.CreatedAt = time.Now().UTC()
	ch.UpdatedAt = time.Now().UTC()

	h.mu.Lock()
	h.memNotificationChannels[ch.ID] = ch
	h.mu.Unlock()

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"status":  "success",
		"channel": ch,
	})
}

// DeleteNotificationChannel handles DELETE /api/v1/notifications/channels/{id}
func (h *APIHandler) DeleteNotificationChannel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Channel ID required")
		return
	}

	h.mu.Lock()
	delete(h.memNotificationChannels, id)
	h.mu.Unlock()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Notification channel deleted",
	})
}

// TestNotificationChannel handles POST /api/v1/notifications/test
func (h *APIHandler) TestNotificationChannel(w http.ResponseWriter, r *http.Request) {
	bodyBytes, _ := io.ReadAll(r.Body)
	var req struct {
		TargetURL string `json:"target_url"`
		Type      string `json:"type"`
	}
	_ = json.Unmarshal(bodyBytes, &req)

	if req.TargetURL == "" {
		writeError(w, http.StatusBadRequest, "Target URL is required")
		return
	}

	testAlarm := models.Alarm{
		ID:           "alarm-test-ping-001",
		TenantID:     "test",
		RuleName:     "High Temperature Guardrail Test",
		DeviceID:     "esp32-node1",
		Severity:     "CRITICAL",
		Status:       "OPEN",
		TriggerValue: 39.8,
		Threshold:    35.0,
		Message:      "Test alert ping dispatched from IoT Platform Mission Control",
		TriggeredAt:  time.Now().UTC(),
	}

	// Dispatch synchronously for testing
	dummyChan := NotificationChannel{
		ID:        "nc-test",
		Name:      "Test Channel",
		Type:      req.Type,
		TargetURL: req.TargetURL,
		Severity:  "ALL",
		Enabled:   true,
	}

	h.mu.Lock()
	h.memNotificationChannels["nc-test"] = dummyChan
	h.mu.Unlock()

	h.DispatchAlarmNotification(testAlarm)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Test notification dispatched to " + req.TargetURL,
	})
}
