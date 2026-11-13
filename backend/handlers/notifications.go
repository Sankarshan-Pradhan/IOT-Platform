package handlers

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
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
	// 1. Dispatch real-time mobile push notifications to all registered operator devices via FCM
	h.DispatchFCMPushNotification(alarm)

	go func() {

		channels := make([]NotificationChannel, 0)

		if h.isDBReady() {
			rows, err := h.DB.Query(`
				SELECT id, tenant_id, name, type, target_url, severity, enabled, created_at, updated_at
				FROM notification_channels
				WHERE enabled = TRUE AND (tenant_id = $1 OR tenant_id = '' OR tenant_id = 'a0000000-0000-0000-0000-000000000001');
			`, alarm.TenantID)
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var ch NotificationChannel
					if err := rows.Scan(&ch.ID, &ch.TenantID, &ch.Name, &ch.Type, &ch.TargetURL, &ch.Severity, &ch.Enabled, &ch.CreatedAt, &ch.UpdatedAt); err == nil {
						if ch.Severity == "ALL" || strings.EqualFold(ch.Severity, alarm.Severity) {
							channels = append(channels, ch)
						}
					}
				}
			}
		}

		if len(channels) == 0 {
			h.mu.RLock()
			for _, ch := range h.memNotificationChannels {
				if ch.Enabled && (ch.TenantID == alarm.TenantID || ch.TenantID == "" || ch.TenantID == "a0000000-0000-0000-0000-000000000001") {
					if ch.Severity == "ALL" || strings.EqualFold(ch.Severity, alarm.Severity) {
						channels = append(channels, ch)
					}
				}
			}
			h.mu.RUnlock()
		}

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

	if h.isDBReady() {
		rows, err := h.DB.Query(`
			SELECT id, tenant_id, name, type, target_url, severity, enabled, created_at, updated_at
			FROM notification_channels
			WHERE ($1 = '' OR tenant_id = $1 OR tenant_id = '')
			ORDER BY created_at DESC;
		`, tenantID)
		if err == nil {
			defer rows.Close()
			list := make([]NotificationChannel, 0)
			for rows.Next() {
				var ch NotificationChannel
				if err := rows.Scan(&ch.ID, &ch.TenantID, &ch.Name, &ch.Type, &ch.TargetURL, &ch.Severity, &ch.Enabled, &ch.CreatedAt, &ch.UpdatedAt); err == nil {
					list = append(list, ch)
				}
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"count":    len(list),
				"channels": list,
			})
			return
		}
	}

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

	if h.isDBReady() {
		_, _ = h.DB.Exec(`
			INSERT INTO notification_channels (id, tenant_id, name, type, target_url, severity, enabled, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
		`, ch.ID, ch.TenantID, ch.Name, ch.Type, ch.TargetURL, ch.Severity, ch.Enabled, ch.CreatedAt, ch.UpdatedAt)
	}

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

	if h.isDBReady() {
		_, _ = h.DB.Exec("DELETE FROM notification_channels WHERE id = $1;", id)
	}

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

// FCMDeviceToken represents a registered push device (iOS, Android, Web) for an operator
type FCMDeviceToken struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	TenantID   string    `json:"tenant_id"`
	DeviceName string    `json:"device_name"`
	Token      string    `json:"fcm_token"`
	Platform   string    `json:"platform"` // "android", "ios", "web"
	Enabled    bool      `json:"enabled"`
	CreatedAt  time.Time `json:"created_at"`
	LastUsedAt time.Time `json:"last_used_at"`
}

// DispatchFCMPushNotification sends mobile push alerts to operators via Firebase Cloud Messaging
func (h *APIHandler) DispatchFCMPushNotification(alarm models.Alarm) {
	go func() {
		tokens := make([]FCMDeviceToken, 0)

		if h.isDBReady() {
			rows, err := h.DB.Query(`
				SELECT id, user_id, COALESCE(tenant_id::text, ''), device_name, fcm_token, platform, enabled, created_at, last_used_at
				FROM fcm_tokens
				WHERE enabled = TRUE AND ($1 = '' OR tenant_id::text = $1 OR tenant_id IS NULL);
			`, alarm.TenantID)
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var tok FCMDeviceToken
					if err := rows.Scan(&tok.ID, &tok.UserID, &tok.TenantID, &tok.DeviceName, &tok.Token, &tok.Platform, &tok.Enabled, &tok.CreatedAt, &tok.LastUsedAt); err == nil {
						tokens = append(tokens, tok)
					}
				}
			}
		}

		if len(tokens) == 0 {
			h.mu.RLock()
			for _, tok := range h.memFCMTokens {
				if tok.Enabled && (tok.TenantID == alarm.TenantID || tok.TenantID == "" || tok.TenantID == "a0000000-0000-0000-0000-000000000001") {
					tokens = append(tokens, tok)
				}
			}
			h.mu.RUnlock()
		}

		pushTitle := fmt.Sprintf("🚨 %s Guardrail Alert: %s", alarm.Severity, alarm.DeviceID)
		pushBody := fmt.Sprintf("%s: Value is %.1f (Threshold: %.1f)", alarm.RuleName, alarm.TriggerValue, alarm.Threshold)

		// Broadcast SSE push event so connected dashboards show real-time operator phone push pulse
		if h.sseBroker != nil {
			h.sseBroker.Broadcast("fcm_push", map[string]interface{}{
				"title":          pushTitle,
				"body":           pushBody,
				"device_id":      alarm.DeviceID,
				"severity":       alarm.Severity,
				"target_devices": len(tokens),
				"timestamp":      time.Now().UTC(),
			})
		}

		if len(tokens) == 0 {
			return
		}

		sa := h.getGoogleServiceAccount()
		h.mu.RLock()
		serverKey := h.fcmServerKey
		h.mu.RUnlock()

		var v1AccessToken string
		if sa != nil {
			if token, err := h.getFCMAccessToken(sa); err == nil {
				v1AccessToken = token
			} else {
				log.Printf("[FCM AUTH] Notice: OAuth2 token exchange with Google: %v", err)
			}
		}

		client := &http.Client{Timeout: 6 * time.Second}

		for _, tok := range tokens {
			// Mode A: Google Cloud Firebase HTTP v1 API with Service Account (Production Recommended)
			if sa != nil && v1AccessToken != "" {
				v1Payload := map[string]interface{}{
					"message": map[string]interface{}{
						"token": tok.Token,
						"notification": map[string]interface{}{
							"title": pushTitle,
							"body":  pushBody,
						},
						"data": map[string]string{
							"alarm_id":  alarm.ID,
							"device_id": alarm.DeviceID,
							"rule_name": alarm.RuleName,
							"severity":  alarm.Severity,
							"value":     fmt.Sprintf("%.1f", alarm.TriggerValue),
							"threshold": fmt.Sprintf("%.1f", alarm.Threshold),
							"timestamp": alarm.TriggeredAt.Format(time.RFC3339),
						},
						"webpush": map[string]interface{}{
							"fcm_options": map[string]interface{}{
								"link": "http://localhost:3000",
							},
						},
					},
				}
				v1Bytes, _ := json.Marshal(v1Payload)
				fcmV1URL := fmt.Sprintf("https://fcm.googleapis.com/v1/projects/%s/messages:send", sa.ProjectID)

				req, err := http.NewRequest("POST", fcmV1URL, bytes.NewBuffer(v1Bytes))
				if err == nil {
					req.Header.Set("Authorization", "Bearer "+v1AccessToken)
					req.Header.Set("Content-Type", "application/json")
					resp, err := client.Do(req)
					if err == nil {
						bodyBytes, _ := io.ReadAll(resp.Body)
						_ = resp.Body.Close()
						if resp.StatusCode == http.StatusOK {
							log.Printf("[FCM PUSH] [Google HTTP v1] Push delivered to '%s' (%s, device_id: %s)", tok.DeviceName, tok.Platform, tok.ID)
						} else if resp.StatusCode == 404 || strings.Contains(string(bodyBytes), "UNREGISTERED") || strings.Contains(string(bodyBytes), "NOT_FOUND") {
							log.Printf("[FCM PUSH] [Token Expired] Device token for '%s' no longer valid on Google; pruning from database", tok.DeviceName)
							if h.isDBReady() {
								_, _ = h.DB.Exec("DELETE FROM fcm_tokens WHERE id = $1", tok.ID)
							}
							h.mu.Lock()
							delete(h.memFCMTokens, tok.ID)
							h.mu.Unlock()
						} else {
							log.Printf("[FCM PUSH] Google HTTP v1 responded with HTTP %d: %s", resp.StatusCode, string(bodyBytes))
						}
					}
				}
				continue
			}

			// Mode B: Legacy Firebase Server Key API
			if serverKey != "" {
				fcmPayload := map[string]interface{}{
					"to":       tok.Token,
					"priority": "high",
					"notification": map[string]interface{}{
						"title":        pushTitle,
						"body":         pushBody,
						"sound":        "default",
						"click_action": "http://localhost:3000",
					},
					"data": map[string]interface{}{
						"alarm_id":  alarm.ID,
						"device_id": alarm.DeviceID,
						"rule_name": alarm.RuleName,
						"severity":  alarm.Severity,
						"value":     alarm.TriggerValue,
						"threshold": alarm.Threshold,
						"timestamp": alarm.TriggeredAt.Format(time.RFC3339),
					},
				}
				payloadBytes, _ := json.Marshal(fcmPayload)

				req, err := http.NewRequest("POST", "https://fcm.googleapis.com/fcm/send", bytes.NewBuffer(payloadBytes))
				if err == nil {
					req.Header.Set("Authorization", "key="+serverKey)
					req.Header.Set("Content-Type", "application/json")
					resp, err := client.Do(req)
					if err == nil {
						_ = resp.Body.Close()
						log.Printf("[FCM PUSH] [Legacy Server Key] Sent live push to '%s' (%s, HTTP %d)", tok.DeviceName, tok.Platform, resp.StatusCode)
					}
				}
				continue
			}

			// Mode C: Simulation Mode with Real-Time SSE Dispatch & Debug Logging
			log.Printf("[FCM PUSH] [Operator Mobile Alert] (Simulated): Dispatched push to '%s' (%s): %s", tok.DeviceName, tok.Platform, pushTitle)
		}
	}()
}

// Google Cloud Service Account Types & Helpers for FCM HTTP v1 API
type googleServiceAccount struct {
	Type         string `json:"type"`
	ProjectID    string `json:"project_id"`
	PrivateKeyID string `json:"private_key_id"`
	PrivateKey   string `json:"private_key"`
	ClientEmail  string `json:"client_email"`
	TokenURI     string `json:"token_uri"`
}

func parseRSAPrivateKey(keyBytes []byte) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode(keyBytes)
	if block == nil {
		return nil, fmt.Errorf("no PEM data found in private key")
	}

	if parsedKey, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		if rsaKey, ok := parsedKey.(*rsa.PrivateKey); ok {
			return rsaKey, nil
		}
		return nil, fmt.Errorf("parsed key is not an RSA private key")
	}

	if rsaKey, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return rsaKey, nil
	}

	return nil, fmt.Errorf("could not parse private key as PKCS#8 or PKCS#1")
}

func (h *APIHandler) getGoogleServiceAccount() *googleServiceAccount {
	h.mu.RLock()
	rawJSON := h.fcmServiceAccountJSON
	filePath := h.fcmCredentialsFile
	h.mu.RUnlock()

	var data []byte
	if strings.TrimSpace(rawJSON) != "" {
		data = []byte(rawJSON)
	} else {
		searchPaths := []string{
			filePath,
			"infra/fcm/service-account.json",
			"../infra/fcm/service-account.json",
			"/etc/fcm/service-account.json",
			"service-account.json",
		}
		for _, p := range searchPaths {
			if p != "" {
				if fileBytes, err := os.ReadFile(p); err == nil && len(fileBytes) > 0 {
					data = fileBytes
					break
				}
			}
		}
	}

	if len(data) == 0 {
		return nil
	}

	var sa googleServiceAccount
	if err := json.Unmarshal(data, &sa); err == nil && sa.PrivateKey != "" && sa.ClientEmail != "" && sa.ProjectID != "" {
		return &sa
	}
	return nil
}

func (h *APIHandler) getFCMAccessToken(sa *googleServiceAccount) (string, error) {
	h.mu.RLock()
	if h.fcmAccessToken != "" && time.Now().Before(h.fcmTokenExpiry) {
		token := h.fcmAccessToken
		h.mu.RUnlock()
		return token, nil
	}
	h.mu.RUnlock()

	rsaKey, err := parseRSAPrivateKey([]byte(sa.PrivateKey))
	if err != nil {
		return "", fmt.Errorf("invalid RSA private key in service account: %w", err)
	}

	now := time.Now().Unix()
	headerBytes, _ := json.Marshal(map[string]string{
		"alg": "RS256",
		"typ": "JWT",
	})
	claimBytes, _ := json.Marshal(map[string]interface{}{
		"iss":   sa.ClientEmail,
		"sub":   sa.ClientEmail,
		"aud":   "https://oauth2.googleapis.com/token",
		"scope": "https://www.googleapis.com/auth/firebase.messaging",
		"iat":   now,
		"exp":   now + 3600,
	})

	unsignedToken := base64.RawURLEncoding.EncodeToString(headerBytes) + "." + base64.RawURLEncoding.EncodeToString(claimBytes)
	hash := sha256.Sum256([]byte(unsignedToken))
	sig, err := rsa.SignPKCS1v15(rand.Reader, rsaKey, crypto.SHA256, hash[:])
	if err != nil {
		return "", fmt.Errorf("failed to sign JWT: %w", err)
	}

	signedJWT := unsignedToken + "." + base64.RawURLEncoding.EncodeToString(sig)

	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", signedJWT)

	tokenResp, err := http.PostForm("https://oauth2.googleapis.com/token", form)
	if err != nil {
		return "", fmt.Errorf("failed to exchange token with Google OAuth: %w", err)
	}
	defer tokenResp.Body.Close()

	if tokenResp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(tokenResp.Body)
		return "", fmt.Errorf("google oauth token request failed (HTTP %d): %s", tokenResp.StatusCode, string(respBody))
	}

	var oauthRes struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.NewDecoder(tokenResp.Body).Decode(&oauthRes); err != nil {
		return "", fmt.Errorf("failed to decode oauth response: %w", err)
	}

	h.mu.Lock()
	h.fcmAccessToken = oauthRes.AccessToken
	h.fcmTokenExpiry = time.Now().Add(time.Duration(oauthRes.ExpiresIn-120) * time.Second)
	h.mu.Unlock()

	return oauthRes.AccessToken, nil
}

// GetFCMConfig handles GET /api/v1/notifications/fcm/config
func (h *APIHandler) GetFCMConfig(w http.ResponseWriter, r *http.Request) {
	sa := h.getGoogleServiceAccount()
	h.mu.RLock()
	serverKeyConfigured := (h.fcmServerKey != "")
	h.mu.RUnlock()

	hasServiceAccount := (sa != nil)
	configured := hasServiceAccount || serverKeyConfigured

	deliveryMode := "simulated_operator_push"
	projectID := ""
	clientEmail := ""

	if hasServiceAccount {
		deliveryMode = "production_google_http_v1"
		projectID = sa.ProjectID
		clientEmail = sa.ClientEmail
	} else if serverKeyConfigured {
		deliveryMode = "production_legacy_server_key"
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"enabled":             true,
		"configured":          configured,
		"delivery_mode":       deliveryMode,
		"has_service_account": hasServiceAccount,
		"has_server_key":      serverKeyConfigured,
		"project_id":          projectID,
		"client_email":        clientEmail,
		"supported_platforms": []string{"android", "ios", "web"},
		"instructions":       "Drop your service-account.json into infra/fcm/ or set FCM_SERVICE_ACCOUNT_JSON in .env for production background mobile phone delivery.",
	})
}

// GetFCMTokens handles GET /api/v1/notifications/fcm/tokens
func (h *APIHandler) GetFCMTokens(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" && caller != nil && caller.TenantID != "" {
		tenantID = caller.TenantID
	}

	if h.isDBReady() {
		rows, err := h.DB.Query(`
			SELECT id, user_id, COALESCE(tenant_id::text, ''), device_name, fcm_token, platform, enabled, created_at, last_used_at
			FROM fcm_tokens
			WHERE ($1 = '' OR tenant_id::text = $1 OR tenant_id IS NULL)
			ORDER BY created_at DESC;
		`, tenantID)
		if err == nil {
			defer rows.Close()
			list := make([]FCMDeviceToken, 0)
			for rows.Next() {
				var tok FCMDeviceToken
				if err := rows.Scan(&tok.ID, &tok.UserID, &tok.TenantID, &tok.DeviceName, &tok.Token, &tok.Platform, &tok.Enabled, &tok.CreatedAt, &tok.LastUsedAt); err == nil {
					list = append(list, tok)
				}
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"count":  len(list),
				"tokens": list,
			})
			return
		}
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	list := make([]FCMDeviceToken, 0)
	for _, tok := range h.memFCMTokens {
		if tenantID == "" || tok.TenantID == tenantID || tok.TenantID == "" {
			list = append(list, tok)
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":  len(list),
		"tokens": list,
	})
}

// RegisterFCMToken handles POST /api/v1/notifications/fcm/token
func (h *APIHandler) RegisterFCMToken(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	var req struct {
		TenantID   string `json:"tenant_id"`
		DeviceName string `json:"device_name"`
		Token      string `json:"fcm_token"`
		Platform   string `json:"platform"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if strings.TrimSpace(req.Token) == "" {
		writeError(w, http.StatusBadRequest, "fcm_token is required")
		return
	}

	if req.DeviceName == "" {
		req.DeviceName = "Operator Mobile Device"
	}
	if req.Platform == "" {
		req.Platform = "web"
	}

	userID := "anonymous-operator"
	if caller != nil && caller.UserID != "" {
		userID = caller.UserID
	}

	tenantID := req.TenantID
	if tenantID == "" && caller != nil && caller.TenantID != "" {
		tenantID = caller.TenantID
	}
	if tenantID == "" {
		tenantID = "a0000000-0000-0000-0000-000000000001"
	}

	b := make([]byte, 8)
	_, _ = rand.Read(b)
	tokID := fmt.Sprintf("fcm-%x", b)
	now := time.Now().UTC()

	tok := FCMDeviceToken{
		ID:         tokID,
		UserID:     userID,
		TenantID:   tenantID,
		DeviceName: req.DeviceName,
		Token:      req.Token,
		Platform:   req.Platform,
		Enabled:    true,
		CreatedAt:  now,
		LastUsedAt: now,
	}

	h.mu.Lock()
	if h.memFCMTokens == nil {
		h.memFCMTokens = make(map[string]FCMDeviceToken)
	}
	h.memFCMTokens[tok.ID] = tok
	h.mu.Unlock()

	if h.isDBReady() {
		_, err := h.DB.Exec(`
			INSERT INTO fcm_tokens (id, user_id, tenant_id, device_name, fcm_token, platform, enabled, created_at, last_used_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (fcm_token) DO UPDATE SET
				device_name = EXCLUDED.device_name,
				platform = EXCLUDED.platform,
				last_used_at = NOW();
		`, tok.ID, tok.UserID, tok.TenantID, tok.DeviceName, tok.Token, tok.Platform, tok.Enabled, tok.CreatedAt, tok.LastUsedAt)
		if err != nil {
			log.Printf("[FCM] Notice saving token to database: %v", err)
		}
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"status":  "success",
		"message": "FCM device registered for mobile push notifications",
		"token":   tok,
	})
}

// DeleteFCMToken handles DELETE /api/v1/notifications/fcm/token/{id}
func (h *APIHandler) DeleteFCMToken(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Token ID is required")
		return
	}

	h.mu.Lock()
	delete(h.memFCMTokens, id)
	h.mu.Unlock()

	if h.isDBReady() {
		_, _ = h.DB.Exec("DELETE FROM fcm_tokens WHERE id = $1;", id)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "FCM device token removed",
	})
}

// TestFCMPush handles POST /api/v1/notifications/fcm/test
func (h *APIHandler) TestFCMPush(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID   string `json:"tenant_id"`
		DeviceName string `json:"device_name"`
		Title      string `json:"title"`
		Body       string `json:"body"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	if req.Title == "" {
		req.Title = "🚨 [TEST ALERT] Machine Overheat Guardrail"
	}
	if req.Body == "" {
		req.Body = "Test notification: Ambient temperature reached 41.2°C (exceeding 35.0°C limit)."
	}

	testAlarm := models.Alarm{
		ID:           "alarm-fcm-test-" + strconv.FormatInt(time.Now().Unix(), 10),
		TenantID:     req.TenantID,
		RuleName:     "High Temperature Guardrail Test",
		DeviceID:     "esp32-dht22-node1",
		Severity:     "CRITICAL",
		Status:       "OPEN",
		TriggerValue: 41.2,
		Threshold:    35.0,
		Message:      req.Body,
		TriggeredAt:  time.Now().UTC(),
	}

	h.DispatchFCMPushNotification(testAlarm)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "success",
		"message":   "FCM mobile push alert dispatched",
		"title":     req.Title,
		"body":      req.Body,
		"timestamp": time.Now().UTC(),
	})
}

