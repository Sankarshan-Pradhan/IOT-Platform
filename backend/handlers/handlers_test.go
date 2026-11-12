package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"iot-backend/backend/models"
)

func TestGetTenants(t *testing.T) {
	api := NewAPIHandler(nil, "test_secret_key")

	// Unauthenticated request should fail with 401
	unauthReq := httptest.NewRequest("GET", "/api/v1/tenants", nil)
	unauthRec := httptest.NewRecorder()
	api.GetTenants(unauthRec, unauthReq)
	if unauthRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 for unauthenticated GetTenants, got %d", unauthRec.Code)
	}

	req := httptest.NewRequest("GET", "/api/v1/tenants", nil)
	req.Header.Set("X-API-Key", "test_secret_key")
	rec := httptest.NewRecorder()

	api.GetTenants(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var res map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to parse JSON response: %v", err)
	}

	count, ok := res["count"].(float64)
	if !ok || count < 1 {
		t.Fatalf("expected at least 1 default tenant, got %v", count)
	}
}

func TestCreateTenant(t *testing.T) {
	api := NewAPIHandler(nil, "test_secret_key")

	payload := map[string]string{
		"name":        "Test Aerospace Org",
		"description": "Satellite and ground station telemetry workspace",
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest("POST", "/api/v1/tenants", bytes.NewBuffer(body))
	req.Header.Set("X-API-Key", "test_secret_key")
	rec := httptest.NewRecorder()

	api.CreateTenant(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var res map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	tenant, ok := res["tenant"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected 'tenant' object in response")
	}

	if tenant["name"] != "Test Aerospace Org" {
		t.Errorf("expected tenant name 'Test Aerospace Org', got %v", tenant["name"])
	}

	if tenant["id"] == "" || tenant["slug"] == "" {
		t.Errorf("expected generated id and slug, got id=%v slug=%v", tenant["id"], tenant["slug"])
	}
}

func TestGetAndCreateChannels(t *testing.T) {
	api := NewAPIHandler(nil, "test_secret_key")

	// 1. Get default channels
	getReq := httptest.NewRequest("GET", "/api/v1/channels", nil)
	getReq.Header.Set("X-API-Key", "test_secret_key")
	getRec := httptest.NewRecorder()
	api.GetChannels(getRec, getReq)

	if getRec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", getRec.Code)
	}

	// 2. Create new channel
	chPayload := map[string]string{
		"name":        "Cryogenic Storage Bay",
		"tenant_id":   "a0000000-0000-0000-0000-000000000001",
		"group":       "Storage Systems",
		"description": "Liquid nitrogen tank monitoring",
	}
	chBody, _ := json.Marshal(chPayload)
	createReq := httptest.NewRequest("POST", "/api/v1/channels", bytes.NewBuffer(chBody))
	createReq.Header.Set("X-API-Key", "test_secret_key")
	createRec := httptest.NewRecorder()
	api.CreateChannel(createRec, createReq)

	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d: %s", createRec.Code, createRec.Body.String())
	}
}

func TestDeviceTelemetryLifecycle(t *testing.T) {
	api := NewAPIHandler(nil, "test_secret_key")

	// 1. Ingest telemetry for device 'esp32-test-node'
	telemetryData := map[string]interface{}{
		"temperature_c": 24.8,
		"humidity_pct":  56.2,
		"seq":           1,
	}
	body, _ := json.Marshal(telemetryData)

	ingestReq := httptest.NewRequest("POST", "/api/v1/devices/esp32-test-node/telemetry", bytes.NewBuffer(body))
	ingestReq.SetPathValue("id", "esp32-test-node")
	ingestRec := httptest.NewRecorder()

	api.IngestDeviceTelemetry(ingestRec, ingestReq)

	if ingestRec.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d: %s", ingestRec.Code, ingestRec.Body.String())
	}

	// 2. Verify device is present in registry
	devReq := httptest.NewRequest("GET", "/api/v1/devices", nil)
	devReq.Header.Set("X-API-Key", "test_secret_key")
	devRec := httptest.NewRecorder()
	api.GetDevices(devRec, devReq)

	if devRec.Code != http.StatusOK {
		t.Fatalf("expected status 200 for GetDevices, got %d", devRec.Code)
	}

	var devRes map[string]interface{}
	_ = json.Unmarshal(devRec.Body.Bytes(), &devRes)
	if devRes["count"].(float64) != 1 {
		t.Errorf("expected 1 device registered, got %v", devRes["count"])
	}

	// 3. Fetch latest telemetry
	latestReq := httptest.NewRequest("GET", "/api/v1/devices/esp32-test-node/telemetry/latest", nil)
	latestReq.SetPathValue("id", "esp32-test-node")
	latestReq.Header.Set("X-API-Key", "test_secret_key")
	latestRec := httptest.NewRecorder()

	api.GetLatestTelemetry(latestRec, latestReq)

	if latestRec.Code != http.StatusOK {
		t.Fatalf("expected status 200 for latest telemetry, got %d", latestRec.Code)
	}

	// 4. Fetch telemetry history
	histReq := httptest.NewRequest("GET", "/api/v1/devices/esp32-test-node/telemetry/history?limit=10&order=ASC", nil)
	histReq.SetPathValue("id", "esp32-test-node")
	histReq.Header.Set("X-API-Key", "test_secret_key")
	histRec := httptest.NewRecorder()

	api.GetTelemetryHistory(histRec, histReq)

	if histRec.Code != http.StatusOK {
		t.Fatalf("expected status 200 for history, got %d", histRec.Code)
	}

	var histRes map[string]interface{}
	_ = json.Unmarshal(histRec.Body.Bytes(), &histRes)
	if histRes["count"].(float64) != 1 {
		t.Errorf("expected 1 record in history, got %v", histRes["count"])
	}
}

func TestAuthMiddleware(t *testing.T) {
	apiKey := "secure_admin_key_123"
	api := NewAPIHandler(nil, apiKey)

	// Ingest a device to test deletion
	ingestReq := httptest.NewRequest("POST", "/api/v1/devices/esp32-auth-test/telemetry", bytes.NewBuffer([]byte(`{"temp": 20}`)))
	ingestReq.SetPathValue("id", "esp32-auth-test")
	api.IngestDeviceTelemetry(httptest.NewRecorder(), ingestReq)

	protectedDelete := api.AuthMiddleware(api.DeleteDevice)

	// 1. Unauthorized request (missing key)
	unauthReq := httptest.NewRequest("DELETE", "/api/v1/devices/esp32-auth-test", nil)
	unauthReq.SetPathValue("id", "esp32-auth-test")
	unauthRec := httptest.NewRecorder()

	protectedDelete(unauthRec, unauthReq)

	if unauthRec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for missing key, got %d", unauthRec.Code)
	}

	// 2. Unauthorized request (wrong key)
	wrongKeyReq := httptest.NewRequest("DELETE", "/api/v1/devices/esp32-auth-test", nil)
	wrongKeyReq.SetPathValue("id", "esp32-auth-test")
	wrongKeyReq.Header.Set("X-API-Key", "wrong_key")
	wrongKeyRec := httptest.NewRecorder()

	protectedDelete(wrongKeyRec, wrongKeyReq)

	if wrongKeyRec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for wrong key, got %d", wrongKeyRec.Code)
	}

	// 3. Authorized request (correct X-API-Key)
	authReq := httptest.NewRequest("DELETE", "/api/v1/devices/esp32-auth-test", nil)
	authReq.SetPathValue("id", "esp32-auth-test")
	authReq.Header.Set("X-API-Key", apiKey)
	authRec := httptest.NewRecorder()

	protectedDelete(authRec, authReq)

	if authRec.Code != http.StatusOK {
		t.Errorf("expected 200 OK for valid API key, got %d", authRec.Code)
	}

	// 4. Authorized request using Bearer authorization header
	authBearerReq := httptest.NewRequest("POST", "/api/v1/devices/reset", nil)
	authBearerReq.Header.Set("Authorization", "Bearer "+apiKey)
	authBearerRec := httptest.NewRecorder()

	protectedReset := api.AuthMiddleware(api.ResetDevices)
	protectedReset(authBearerRec, authBearerReq)

	if authBearerRec.Code != http.StatusOK {
		t.Errorf("expected 200 OK for valid Bearer token, got %d", authBearerRec.Code)
	}
}

func TestDeleteTenantAndChannel(t *testing.T) {
	api := NewAPIHandler(nil, "test_secret_key")

	// 1. Create and delete tenant
	createTenantReq := httptest.NewRequest("POST", "/api/v1/tenants", bytes.NewBuffer([]byte(`{"name": "Temporary Workspace"}`)))
	createTenantReq.Header.Set("X-API-Key", "test_secret_key")
	createTenantRec := httptest.NewRecorder()
	api.CreateTenant(createTenantRec, createTenantReq)

	var res map[string]interface{}
	_ = json.Unmarshal(createTenantRec.Body.Bytes(), &res)
	tenantObj := res["tenant"].(map[string]interface{})
	tenantID := tenantObj["id"].(string)

	delTenantReq := httptest.NewRequest("DELETE", "/api/v1/tenants/"+tenantID, nil)
	delTenantReq.SetPathValue("id", tenantID)
	delTenantReq.Header.Set("X-API-Key", "test_secret_key")
	delTenantRec := httptest.NewRecorder()
	api.DeleteTenant(delTenantRec, delTenantReq)

	if delTenantRec.Code != http.StatusOK {
		t.Fatalf("expected status 200 for DeleteTenant, got %d", delTenantRec.Code)
	}

	// 2. Create and delete channel
	createChanReq := httptest.NewRequest("POST", "/api/v1/channels", bytes.NewBuffer([]byte(`{"name": "Temporary Channel"}`)))
	createChanReq.Header.Set("X-API-Key", "test_secret_key")
	createChanRec := httptest.NewRecorder()
	api.CreateChannel(createChanRec, createChanReq)

	var chanRes map[string]interface{}
	_ = json.Unmarshal(createChanRec.Body.Bytes(), &chanRes)
	chanObj := chanRes["channel"].(map[string]interface{})
	channelID := chanObj["id"].(string)

	delChanReq := httptest.NewRequest("DELETE", "/api/v1/channels/"+channelID, nil)
	delChanReq.SetPathValue("id", channelID)
	delChanReq.Header.Set("X-API-Key", "test_secret_key")
	delChanRec := httptest.NewRecorder()
	api.DeleteChannel(delChanRec, delChanReq)

	if delChanRec.Code != http.StatusOK {
		t.Fatalf("expected status 200 for DeleteChannel, got %d", delChanRec.Code)
	}
}

func TestJWTAuthentication(t *testing.T) {
	api := NewAPIHandler(nil, "test_admin_key")

	// 1. Valid login
	loginBody, _ := json.Marshal(map[string]string{
		"username": "admin",
		"password": "admin123",
	})
	loginReq := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewBuffer(loginBody))
	loginRec := httptest.NewRecorder()
	api.Login(loginRec, loginReq)

	if loginRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on valid login, got %d: %s", loginRec.Code, loginRec.Body.String())
	}

	var loginRes map[string]interface{}
	if err := json.Unmarshal(loginRec.Body.Bytes(), &loginRes); err != nil {
		t.Fatalf("failed to parse login response: %v", err)
	}
	token, ok := loginRes["token"].(string)
	if !ok || token == "" {
		t.Fatalf("expected token string in login response")
	}

	// 2. Invalid credentials login
	badLoginBody, _ := json.Marshal(map[string]string{
		"username": "admin",
		"password": "wrongpassword",
	})
	badLoginReq := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewBuffer(badLoginBody))
	badLoginRec := httptest.NewRecorder()
	api.Login(badLoginRec, badLoginReq)

	if badLoginRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized on bad credentials, got %d", badLoginRec.Code)
	}

	// 3. Test AuthMiddleware with Bearer JWT
	protectedHandler := api.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"message": "access granted"}`))
	})

	validAuthReq := httptest.NewRequest("GET", "/protected", nil)
	validAuthReq.Header.Set("Authorization", "Bearer "+token)
	validAuthRec := httptest.NewRecorder()
	protectedHandler(validAuthRec, validAuthReq)

	if validAuthRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK with valid JWT token, got %d", validAuthRec.Code)
	}

	// 4. Test AuthMiddleware with invalid token
	invalidAuthReq := httptest.NewRequest("GET", "/protected", nil)
	invalidAuthReq.Header.Set("Authorization", "Bearer invalid.token.signature")
	invalidAuthRec := httptest.NewRecorder()
	protectedHandler(invalidAuthRec, invalidAuthReq)

	if invalidAuthRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized with invalid JWT, got %d", invalidAuthRec.Code)
	}
}

func TestGuardrailRuleEvaluation(t *testing.T) {
	api := NewAPIHandler(nil, "test_admin_key")

	// 1. Initial state: verify default overheat rule exists (temperature_c > 35.0)
	rulesReq := httptest.NewRequest("GET", "/api/v1/rules", nil)
	rulesReq.Header.Set("X-API-Key", "test_admin_key")
	rulesRec := httptest.NewRecorder()
	api.GetRules(rulesRec, rulesReq)

	if rulesRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for GetRules, got %d", rulesRec.Code)
	}

	// 2. Normal temperature telemetry (25.0°C <= 35.0°C): No alarm should trigger
	normalPayload := []byte(`{"temperature_c": 25.0, "humidity_pct": 50.0}`)
	if err := api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", "test-node-safe", time.Now().UTC(), normalPayload); err != nil {
		t.Fatalf("ProcessTelemetry failed: %v", err)
	}

	alarmsReq := httptest.NewRequest("GET", "/api/v1/alarms?device_id=test-node-safe", nil)
	alarmsReq.Header.Set("X-API-Key", "test_admin_key")
	alarmsRec := httptest.NewRecorder()
	api.GetAlarms(alarmsRec, alarmsReq)

	var safeAlarmsRes map[string]interface{}
	_ = json.Unmarshal(alarmsRec.Body.Bytes(), &safeAlarmsRes)
	if count := safeAlarmsRes["count"].(float64); count != 0 {
		t.Fatalf("expected 0 alarms for safe temperature, got %v", count)
	}

	// 3. Overheat temperature telemetry (38.5°C > 35.0°C): OPEN alarm MUST trigger dynamically!
	overheatPayload := []byte(`{"temperature_c": 38.5, "humidity_pct": 45.0}`)
	if err := api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", "test-node-hot", time.Now().UTC(), overheatPayload); err != nil {
		t.Fatalf("ProcessTelemetry failed: %v", err)
	}

	hotAlarmsReq := httptest.NewRequest("GET", "/api/v1/alarms?device_id=test-node-hot&status=OPEN", nil)
	hotAlarmsReq.Header.Set("X-API-Key", "test_admin_key")
	hotAlarmsRec := httptest.NewRecorder()
	api.GetAlarms(hotAlarmsRec, hotAlarmsReq)

	var hotAlarmsRes map[string]interface{}
	_ = json.Unmarshal(hotAlarmsRec.Body.Bytes(), &hotAlarmsRes)
	if count := hotAlarmsRes["count"].(float64); count != 1 {
		t.Fatalf("expected 1 OPEN alarm for overheat condition, got %v", count)
	}

	alarmsList := hotAlarmsRes["alarms"].([]interface{})
	firstAlarm := alarmsList[0].(map[string]interface{})
	alarmID := firstAlarm["id"].(string)

	if firstAlarm["status"] != "OPEN" {
		t.Errorf("expected alarm status 'OPEN', got %v", firstAlarm["status"])
	}
	if triggerVal := firstAlarm["trigger_value"].(float64); triggerVal != 38.5 {
		t.Errorf("expected trigger value 38.5, got %v", triggerVal)
	}

	// 4. Acknowledge alarm
	ackReq := httptest.NewRequest("POST", "/api/v1/alarms/"+alarmID+"/acknowledge", nil)
	ackReq.SetPathValue("id", alarmID)
	ackReq.Header.Set("X-API-Key", "test_admin_key")
	ackRec := httptest.NewRecorder()
	api.AcknowledgeAlarm(ackRec, ackReq)

	if ackRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for AcknowledgeAlarm, got %d", ackRec.Code)
	}

	// 5. Create a dynamic custom threshold rule (humidity_pct > 80.0)
	customRuleJSON, _ := json.Marshal(map[string]interface{}{
		"name":      "High Humidity Mold Alert",
		"field":     "humidity_pct",
		"operator":  ">",
		"threshold": 80.0,
		"severity":  "WARNING",
	})
	createRuleReq := httptest.NewRequest("POST", "/api/v1/rules", bytes.NewBuffer(customRuleJSON))
	createRuleReq.Header.Set("X-API-Key", "test_admin_key")
	createRuleRec := httptest.NewRecorder()
	api.CreateRule(createRuleRec, createRuleReq)

	if createRuleRec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for CreateRule, got %d: %s", createRuleRec.Code, createRuleRec.Body.String())
	}

	// 6. Ingest humidity exceeding custom rule (86.0% > 80.0%)
	humPayload := []byte(`{"temperature_c": 22.0, "humidity_pct": 86.0}`)
	_ = api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", "test-node-humid", time.Now().UTC(), humPayload)

	humAlarmsReq := httptest.NewRequest("GET", "/api/v1/alarms?device_id=test-node-humid&status=OPEN", nil)
	humAlarmsReq.Header.Set("X-API-Key", "test_admin_key")
	humAlarmsRec := httptest.NewRecorder()
	api.GetAlarms(humAlarmsRec, humAlarmsReq)

	var humAlarmsRes map[string]interface{}
	_ = json.Unmarshal(humAlarmsRec.Body.Bytes(), &humAlarmsRes)
	if count := humAlarmsRes["count"].(float64); count != 1 {
		t.Fatalf("expected 1 OPEN alarm for custom humidity rule, got %v", count)
	}

	// 7. Auto-resolution: Telemetry drops below threshold (humidity_pct = 65.0)
	normalHumPayload := []byte(`{"temperature_c": 22.0, "humidity_pct": 65.0}`)
	_ = api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", "test-node-humid", time.Now().UTC(), normalHumPayload)

	resolvedAlarmsReq := httptest.NewRequest("GET", "/api/v1/alarms?device_id=test-node-humid&status=RESOLVED", nil)
	resolvedAlarmsReq.Header.Set("X-API-Key", "test_admin_key")
	resolvedAlarmsRec := httptest.NewRecorder()
	api.GetAlarms(resolvedAlarmsRec, resolvedAlarmsReq)

	var resHumAlarms map[string]interface{}
	_ = json.Unmarshal(resolvedAlarmsRec.Body.Bytes(), &resHumAlarms)
	if count := resHumAlarms["count"].(float64); count != 1 {
		t.Fatalf("expected alarm to auto-resolve when reading normalized, got %v", count)
	}
}

func TestUserRegistrationAndUserScopedWorkspaces(t *testing.T) {
	api := NewAPIHandler(nil, "test_admin_key")

	// 1. Register a new user
	regPayload, _ := json.Marshal(models.RegisterRequest{
		Name:     "Alexander Wright",
		Mobile:   "+1-555-0199",
		Email:    "alex@plant.local",
		Username: "alex_wright",
		Password: "password123",
	})
	regReq := httptest.NewRequest("POST", "/api/v1/auth/register", bytes.NewBuffer(regPayload))
	regRec := httptest.NewRecorder()
	api.Register(regRec, regReq)

	if regRec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created on registration, got %d: %s", regRec.Code, regRec.Body.String())
	}

	var regRes models.LoginResponse
	if err := json.Unmarshal(regRec.Body.Bytes(), &regRes); err != nil {
		t.Fatalf("failed to parse registration response: %v", err)
	}
	if regRes.User.Username != "alex_wright" || regRes.Token == "" {
		t.Fatalf("unexpected registered user: %+v", regRes.User)
	}
	userToken := regRes.Token

	// 2. Login with email
	emailLoginPayload, _ := json.Marshal(models.LoginRequest{
		Username: "alex@plant.local",
		Password: "password123",
	})
	loginReq := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewBuffer(emailLoginPayload))
	loginRec := httptest.NewRecorder()
	api.Login(loginRec, loginReq)

	if loginRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on email login, got %d: %s", loginRec.Code, loginRec.Body.String())
	}

	// 3. User initially has 0 workspaces upon registration
	userTenantsReq := httptest.NewRequest("GET", "/api/v1/tenants", nil)
	userTenantsReq.Header.Set("Authorization", "Bearer "+userToken)
	userTenantsRec := httptest.NewRecorder()
	api.GetTenants(userTenantsRec, userTenantsReq)

	var userTenantsRes map[string]interface{}
	_ = json.Unmarshal(userTenantsRec.Body.Bytes(), &userTenantsRes)
	tenantsList := userTenantsRes["tenants"].([]interface{})
	if len(tenantsList) != 0 {
		t.Fatalf("expected regular user to initially have 0 workspaces, got %d", len(tenantsList))
	}

	// 3b. User creates their first workspace via POST /api/v1/tenants
	createWSPayload, _ := json.Marshal(models.Tenant{
		Name: "Alexander Wright's Workspace",
		Slug: "alex-workspace",
	})
	createWSReq := httptest.NewRequest("POST", "/api/v1/tenants", bytes.NewBuffer(createWSPayload))
	createWSReq.Header.Set("Authorization", "Bearer "+userToken)
	createWSRec := httptest.NewRecorder()
	api.CreateTenant(createWSRec, createWSReq)
	if createWSRec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created on workspace creation, got %d: %s", createWSRec.Code, createWSRec.Body.String())
	}

	// 3c. User fetches workspaces again: should now see 1 workspace
	userTenantsRec2 := httptest.NewRecorder()
	userTenantsReq2 := httptest.NewRequest("GET", "/api/v1/tenants", nil)
	userTenantsReq2.Header.Set("Authorization", "Bearer "+userToken)
	api.GetTenants(userTenantsRec2, userTenantsReq2)

	var userTenantsRes2 map[string]interface{}
	_ = json.Unmarshal(userTenantsRec2.Body.Bytes(), &userTenantsRes2)
	tenantsList2 := userTenantsRes2["tenants"].([]interface{})
	if len(tenantsList2) != 1 {
		t.Fatalf("expected regular user to now see 1 created workspace, got %d", len(tenantsList2))
	}
	firstWS := tenantsList2[0].(map[string]interface{})
	if firstWS["name"] != "Alexander Wright's Workspace" {
		t.Fatalf("unexpected workspace name: %v", firstWS["name"])
	}

	// 4. Admin logs in and fetches workspaces: should see ALL workspaces (default org + alex's workspace)
	adminLoginPayload, _ := json.Marshal(models.LoginRequest{
		Username: "admin",
		Password: "admin123",
	})
	adminLoginReq := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewBuffer(adminLoginPayload))
	adminLoginRec := httptest.NewRecorder()
	api.Login(adminLoginRec, adminLoginReq)

	var adminLoginRes models.LoginResponse
	_ = json.Unmarshal(adminLoginRec.Body.Bytes(), &adminLoginRes)
	adminToken := adminLoginRes.Token

	adminTenantsReq := httptest.NewRequest("GET", "/api/v1/tenants", nil)
	adminTenantsReq.Header.Set("Authorization", "Bearer "+adminToken)
	adminTenantsRec := httptest.NewRecorder()
	api.GetTenants(adminTenantsRec, adminTenantsReq)

	var adminTenantsRes map[string]interface{}
	_ = json.Unmarshal(adminTenantsRec.Body.Bytes(), &adminTenantsRes)
	adminList := adminTenantsRes["tenants"].([]interface{})
	if len(adminList) < 2 {
		t.Fatalf("expected admin to see all workspaces (at least 2), got %d", len(adminList))
	}

	// 5. Admin lists all users via GET /api/v1/users
	usersReq := httptest.NewRequest("GET", "/api/v1/users", nil)
	usersReq.Header.Set("Authorization", "Bearer "+adminToken)
	usersRec := httptest.NewRecorder()
	api.GetUsers(usersRec, usersReq)

	if usersRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on GET /api/v1/users, got %d", usersRec.Code)
	}

	var usersRes map[string]interface{}
	_ = json.Unmarshal(usersRec.Body.Bytes(), &usersRes)
	usersCount := usersRes["count"].(float64)
	if usersCount < 2 { // admin + alex_wright
		t.Fatalf("expected at least 2 users in admin users list, got %v", usersCount)
	}

	// 6. Regular user cannot access GET /api/v1/users
	unauthUsersReq := httptest.NewRequest("GET", "/api/v1/users", nil)
	unauthUsersReq.Header.Set("Authorization", "Bearer "+userToken)
	unauthUsersRec := httptest.NewRecorder()
	api.GetUsers(unauthUsersRec, unauthUsersReq)

	if unauthUsersRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for regular user on /api/v1/users, got %d", unauthUsersRec.Code)
	}

	// 7. Regular user cannot DELETE user
	unauthDelReq := httptest.NewRequest("DELETE", "/api/v1/users/"+regRes.User.ID, nil)
	unauthDelReq.SetPathValue("id", regRes.User.ID)
	unauthDelReq.Header.Set("Authorization", "Bearer "+userToken)
	unauthDelRec := httptest.NewRecorder()
	api.AuthMiddleware(api.DeleteUser)(unauthDelRec, unauthDelReq)
	if unauthDelRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for regular user deleting account, got %d", unauthDelRec.Code)
	}

	// 8. Admin cannot delete primary admin
	adminDelSelfReq := httptest.NewRequest("DELETE", "/api/v1/users/usr-admin-system-001", nil)
	adminDelSelfReq.SetPathValue("id", "usr-admin-system-001")
	adminDelSelfReq.Header.Set("Authorization", "Bearer "+adminToken)
	adminDelSelfRec := httptest.NewRecorder()
	api.AuthMiddleware(api.DeleteUser)(adminDelSelfRec, adminDelSelfReq)
	if adminDelSelfRec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request deleting admin account, got %d", adminDelSelfRec.Code)
	}

	// 9. Admin successfully deletes user alex_wright
	adminDelReq := httptest.NewRequest("DELETE", "/api/v1/users/"+regRes.User.ID, nil)
	adminDelReq.SetPathValue("id", regRes.User.ID)
	adminDelReq.Header.Set("Authorization", "Bearer "+adminToken)
	adminDelRec := httptest.NewRecorder()
	api.AuthMiddleware(api.DeleteUser)(adminDelRec, adminDelReq)
	if adminDelRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK deleting alex_wright, got %d: %s", adminDelRec.Code, adminDelRec.Body.String())
	}

	// 10. Verify alex_wright is gone from user directory
	usersReq2 := httptest.NewRequest("GET", "/api/v1/users", nil)
	usersReq2.Header.Set("Authorization", "Bearer "+adminToken)
	usersRec2 := httptest.NewRecorder()
	api.GetUsers(usersRec2, usersReq2)

	var usersRes2 map[string]interface{}
	_ = json.Unmarshal(usersRec2.Body.Bytes(), &usersRes2)
	users2 := usersRes2["users"].([]interface{})
	for _, uItem := range users2 {
		uMap := uItem.(map[string]interface{})
		if uMap["id"] == regRes.User.ID {
			t.Fatalf("expected user %s to be deleted, but still found in list", regRes.User.ID)
		}
	}
}

type mockPublisher struct {
	lastTopic   string
	lastPayload []byte
}

func (m *mockPublisher) PublishCommand(deviceID string, payload []byte) error {
	m.lastTopic = "devices/" + deviceID + "/commands"
	m.lastPayload = payload
	return nil
}

func TestDownlinkDeviceCommands(t *testing.T) {
	api := NewAPIHandler(nil, "test_secret_key")
	pub := &mockPublisher{}
	api.SetMQTTPublisher(pub)

	// Ingest a device first
	_ = api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", "test-node-downlink", time.Now().UTC(), []byte(`{"temperature_c": 22.5}`))

	// 1. Dispatch SendCommand (set_relay)
	cmdBody := []byte(`{"action":"set_relay","payload":{"relay_id":1,"state":true}}`)
	req := httptest.NewRequest("POST", "/api/v1/devices/test-node-downlink/commands", bytes.NewBuffer(cmdBody))
	req.SetPathValue("id", "test-node-downlink")
	rec := httptest.NewRecorder()

	api.SendCommand(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected status 202 Accepted, got %d: %s", rec.Code, rec.Body.String())
	}

	var res map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	cmdMap, ok := res["command"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected command in response")
	}
	cmdID := cmdMap["id"].(string)

	if pub.lastTopic != "devices/test-node-downlink/commands" {
		t.Fatalf("expected MQTT topic 'devices/test-node-downlink/commands', got '%s'", pub.lastTopic)
	}

	// 2. Fetch commands for device
	getReq := httptest.NewRequest("GET", "/api/v1/devices/test-node-downlink/commands", nil)
	getReq.SetPathValue("id", "test-node-downlink")
	getRec := httptest.NewRecorder()
	api.GetDeviceCommands(getRec, getReq)

	if getRec.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK, got %d", getRec.Code)
	}

	// 3. Process Command Acknowledgment from device
	ackPayload := []byte(fmt.Sprintf(`{"command_id":"%s","device_id":"test-node-downlink","status":"ACKNOWLEDGED","result":"Relay 1 energized"}`, cmdID))
	err := api.ProcessCommandAck("test-node-downlink", ackPayload)
	if err != nil {
		t.Fatalf("failed to process command ack: %v", err)
	}

	// 4. Verify command status is updated to ACKNOWLEDGED
	getReq2 := httptest.NewRequest("GET", "/api/v1/devices/test-node-downlink/commands", nil)
	getReq2.SetPathValue("id", "test-node-downlink")
	getRec2 := httptest.NewRecorder()
	api.GetDeviceCommands(getRec2, getReq2)

	var getRes2 map[string]interface{}
	_ = json.Unmarshal(getRec2.Body.Bytes(), &getRes2)
	cmds := getRes2["commands"].([]interface{})
	if len(cmds) != 1 {
		t.Fatalf("expected 1 command, got %d", len(cmds))
	}
	c0 := cmds[0].(map[string]interface{})
	if c0["status"] != "ACKNOWLEDGED" {
		t.Fatalf("expected status ACKNOWLEDGED, got %v", c0["status"])
	}
	if c0["response"] != "Relay 1 energized" {
		t.Fatalf("expected response 'Relay 1 energized', got %v", c0["response"])
	}
}

func TestNotificationChannels(t *testing.T) {
	api := NewAPIHandler(nil, "test_secret_key")

	// 1. Create notification channel
	chPayload := []byte(`{"name":"Discord Ops Room","type":"discord","target_url":"https://discord.com/api/webhooks/test","severity":"CRITICAL"}`)
	req := httptest.NewRequest("POST", "/api/v1/notifications/channels", bytes.NewBuffer(chPayload))
	rec := httptest.NewRecorder()
	api.CreateNotificationChannel(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}

	var res map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &res)
	chMap := res["channel"].(map[string]interface{})
	chID := chMap["id"].(string)

	// 2. List notification channels
	listReq := httptest.NewRequest("GET", "/api/v1/notifications/channels", nil)
	listRec := httptest.NewRecorder()
	api.GetNotificationChannels(listRec, listReq)

	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", listRec.Code)
	}

	// 3. Delete channel
	delReq := httptest.NewRequest("DELETE", "/api/v1/notifications/channels/"+chID, nil)
	delReq.SetPathValue("id", chID)
	delRec := httptest.NewRecorder()
	api.DeleteNotificationChannel(delRec, delReq)

	if delRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", delRec.Code)
	}
}

func TestContinuousAggregatesAndDownsampling(t *testing.T) {
	api := NewAPIHandler(nil, "test_secret_key")
	devID := "node-rollup-test"
	baseTime := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)

	// Ingest 6 data points across 3 minutes
	_ = api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", devID, baseTime, []byte(`{"temperature_c": 20.0, "humidity_pct": 50.0, "wifi_rssi": -65}`))
	_ = api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", devID, baseTime.Add(30*time.Second), []byte(`{"temperature_c": 24.0, "humidity_pct": 54.0, "wifi_rssi": -63}`))
	_ = api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", devID, baseTime.Add(65*time.Second), []byte(`{"temperature_c": 30.0, "humidity_pct": 60.0, "wifi_rssi": -70}`))
	_ = api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", devID, baseTime.Add(90*time.Second), []byte(`{"temperature_c": 32.0, "humidity_pct": 62.0, "wifi_rssi": -72}`))
	_ = api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", devID, baseTime.Add(125*time.Second), []byte(`{"temperature_c": 40.0, "humidity_pct": 70.0, "wifi_rssi": -60}`))
	_ = api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", devID, baseTime.Add(150*time.Second), []byte(`{"temperature_c": 42.0, "humidity_pct": 72.0, "wifi_rssi": -58}`))

	// 1. Query raw telemetry
	rawReq := httptest.NewRequest("GET", "/api/v1/devices/"+devID+"/telemetry/history?resolution=raw", nil)
	rawReq.SetPathValue("id", devID)
	rawReq.Header.Set("X-API-Key", "test_secret_key")
	rawRec := httptest.NewRecorder()
	api.GetTelemetryHistory(rawRec, rawReq)
	if rawRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on raw telemetry, got %d", rawRec.Code)
	}
	var rawRes map[string]interface{}
	_ = json.Unmarshal(rawRec.Body.Bytes(), &rawRes)
	if rawRes["count"].(float64) != 6 {
		t.Fatalf("expected 6 raw records, got %v", rawRes["count"])
	}

	// 2. Query 1-minute downsampled continuous aggregate
	downReq := httptest.NewRequest("GET", "/api/v1/devices/"+devID+"/telemetry/history?resolution=1m", nil)
	downReq.SetPathValue("id", devID)
	downReq.Header.Set("X-API-Key", "test_secret_key")
	downRec := httptest.NewRecorder()
	api.GetTelemetryHistory(downRec, downReq)
	if downRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on 1m downsampled telemetry, got %d", downRec.Code)
	}
	var downRes map[string]interface{}
	_ = json.Unmarshal(downRec.Body.Bytes(), &downRes)
	// 3 buckets (minute 0, 1, 2)
	if downRes["count"].(float64) != 3 {
		t.Fatalf("expected 3 rollup buckets for 1m, got %v", downRes["count"])
	}
	history := downRes["history"].([]interface{})
	firstBucket := history[0].(map[string]interface{})
	pMap := firstBucket["payload"].(map[string]interface{})
	if pMap["temperature_c"].(float64) != 22.0 {
		t.Fatalf("expected avg temp 22.0 in first bucket, got %v", pMap["temperature_c"])
	}
	if pMap["temperature_c_min"].(float64) != 20.0 || pMap["temperature_c_max"].(float64) != 24.0 {
		t.Fatalf("expected min=20.0, max=24.0 in first bucket, got min=%v, max=%v", pMap["temperature_c_min"], pMap["temperature_c_max"])
	}
}

func TestTelemetryExport(t *testing.T) {
	api := NewAPIHandler(nil, "test_secret_key")
	devID := "node-export-test"
	now := time.Now().UTC()

	_ = api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", devID, now, []byte(`{"temperature_c": 25.5, "humidity_pct": 55.0, "wifi_rssi": -65}`))

	// 1. Export as CSV
	csvReq := httptest.NewRequest("GET", "/api/v1/devices/"+devID+"/telemetry/export?format=csv", nil)
	csvReq.SetPathValue("id", devID)
	csvReq.Header.Set("X-API-Key", "test_secret_key")
	csvRec := httptest.NewRecorder()
	api.ExportTelemetry(csvRec, csvReq)

	if csvRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on CSV export, got %d", csvRec.Code)
	}
	if !strings.Contains(csvRec.Header().Get("Content-Type"), "text/csv") {
		t.Fatalf("expected text/csv Content-Type, got %s", csvRec.Header().Get("Content-Type"))
	}
	csvBody := csvRec.Body.String()
	if !strings.Contains(csvBody, "timestamp_iso8601,tenant_id,device_id") || !strings.Contains(csvBody, "25.50") {
		t.Fatalf("expected CSV content with header and data, got:\n%s", csvBody)
	}

	// 2. Export as JSON
	jsonReq := httptest.NewRequest("GET", "/api/v1/devices/"+devID+"/telemetry/export?format=json", nil)
	jsonReq.SetPathValue("id", devID)
	jsonReq.Header.Set("X-API-Key", "test_secret_key")
	jsonRec := httptest.NewRecorder()
	api.ExportTelemetry(jsonRec, jsonReq)

	if jsonRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on JSON export, got %d", jsonRec.Code)
	}
	if !strings.Contains(jsonRec.Header().Get("Content-Type"), "application/json") {
		t.Fatalf("expected application/json Content-Type, got %s", jsonRec.Header().Get("Content-Type"))
	}
}

func TestDeviceProvisioningAndOTA(t *testing.T) {
	api := NewAPIHandler(nil, "test_secret_key")
	pub := &mockPublisher{}
	api.SetMQTTPublisher(pub)
	devID := "node-ota-test"
	now := time.Now().UTC()

	_ = api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", devID, now, []byte(`{"temperature_c": 21.0}`))

	// 1. Regenerate Device Auth Token
	tokReq := httptest.NewRequest("POST", "/api/v1/devices/"+devID+"/token", nil)
	tokReq.SetPathValue("id", devID)
	tokRec := httptest.NewRecorder()
	api.RegenerateDeviceToken(tokRec, tokReq)

	if tokRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on RegenerateDeviceToken, got %d", tokRec.Code)
	}
	var tokRes map[string]interface{}
	_ = json.Unmarshal(tokRec.Body.Bytes(), &tokRes)
	tokenStr, ok := tokRes["auth_token"].(string)
	if !ok || !strings.HasPrefix(tokenStr, "tok_node-ota-test_") {
		t.Fatalf("expected generated token with prefix, got %v", tokRes["auth_token"])
	}

	// 2. Trigger Device OTA
	otaPayload := []byte(`{"version":"v1.2.0","filename":"esp32_firmware_v1.2.0.bin"}`)
	otaReq := httptest.NewRequest("POST", "/api/v1/devices/"+devID+"/ota", bytes.NewBuffer(otaPayload))
	otaReq.SetPathValue("id", devID)
	otaRec := httptest.NewRecorder()
	api.TriggerDeviceOTA(otaRec, otaReq)

	if otaRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on TriggerDeviceOTA, got %d: %s", otaRec.Code, otaRec.Body.String())
	}
	if pub.lastTopic != "devices/node-ota-test/commands" {
		t.Fatalf("expected MQTT publish to devices/node-ota-test/commands, got %s", pub.lastTopic)
	}
	if !strings.Contains(string(pub.lastPayload), "ota_update") || !strings.Contains(string(pub.lastPayload), "v1.2.0") {
		t.Fatalf("expected payload to contain ota_update and v1.2.0, got %s", string(pub.lastPayload))
	}
}

func TestTelemetryRetentionAndPruning(t *testing.T) {
	api := NewAPIHandler(nil, "test_secret_key")
	dev1 := "node-retention-01"
	dev2 := "node-retention-02"

	// 1. Configure Retention Policy with max 5 records
	api.SetTelemetryRetention(5, 30)
	if api.GetMaxTelemetryRecords() != 5 {
		t.Fatalf("expected maxTelemetryRecords=5, got %d", api.GetMaxTelemetryRecords())
	}
	if api.GetPruneIntervalSec() != 30 {
		t.Fatalf("expected pruneIntervalSec=30, got %d", api.GetPruneIntervalSec())
	}

	baseTime := time.Date(2026, 11, 12, 10, 0, 0, 0, time.UTC)

	// 2. Ingest 10 records (5 for dev1, 5 for dev2) with incrementing timestamps
	for i := 1; i <= 5; i++ {
		t1 := baseTime.Add(time.Duration(i*2) * time.Minute)
		payload1 := []byte(fmt.Sprintf(`{"temperature_c": %f}`, float64(20+i)))
		if err := api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", dev1, t1, payload1); err != nil {
			t.Fatalf("failed ingesting for dev1: %v", err)
		}

		t2 := baseTime.Add(time.Duration(i*2+1) * time.Minute)
		payload2 := []byte(fmt.Sprintf(`{"temperature_c": %f}`, float64(30+i)))
		if err := api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", dev2, t2, payload2); err != nil {
			t.Fatalf("failed ingesting for dev2: %v", err)
		}
	}

	// 3. Verify total records is 10 before prune
	statsReq := httptest.NewRequest("GET", "/api/v1/telemetry/stats", nil)
	statsRec := httptest.NewRecorder()
	api.GetTelemetryStats(statsRec, statsReq)
	if statsRec.Code != http.StatusOK {
		t.Fatalf("expected 200 on GetTelemetryStats, got %d", statsRec.Code)
	}
	var statsRes map[string]interface{}
	_ = json.Unmarshal(statsRec.Body.Bytes(), &statsRes)
	if statsRes["total_records"].(float64) != 10 {
		t.Fatalf("expected 10 total records before pruning, got %v", statsRes["total_records"])
	}

	// 4. Run PruneOldTelemetry(5)
	pruned, err := api.PruneOldTelemetry(5)
	if err != nil {
		t.Fatalf("unexpected error pruning telemetry: %v", err)
	}
	if pruned != 5 {
		t.Fatalf("expected 5 pruned records, got %d", pruned)
	}

	// 5. Verify total records is now 5
	statsRec2 := httptest.NewRecorder()
	api.GetTelemetryStats(statsRec2, statsReq)
	_ = json.Unmarshal(statsRec2.Body.Bytes(), &statsRes)
	if statsRes["total_records"].(float64) != 5 {
		t.Fatalf("expected exactly 5 records remaining after pruning, got %v", statsRes["total_records"])
	}

	// 6. Running prune again when count <= max should prune 0 records
	prunedAgain, err := api.PruneOldTelemetry(5)
	if err != nil {
		t.Fatalf("unexpected error on second prune: %v", err)
	}
	if prunedAgain != 0 {
		t.Fatalf("expected 0 pruned records when table <= max, got %d", prunedAgain)
	}

	// 7. Test HTTP prune endpoint: Ingest 3 more records
	for i := 6; i <= 8; i++ {
		tNew := baseTime.Add(time.Duration(i*3) * time.Minute)
		payload := []byte(fmt.Sprintf(`{"temperature_c": %f}`, float64(40+i)))
		_ = api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", dev1, tNew, payload)
	}

	pruneReq := httptest.NewRequest("POST", "/api/v1/telemetry/prune", bytes.NewBuffer([]byte(`{"max_records": 5}`)))
	pruneRec := httptest.NewRecorder()
	api.PruneTelemetryHTTP(pruneRec, pruneReq)
	if pruneRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on PruneTelemetryHTTP, got %d: %s", pruneRec.Code, pruneRec.Body.String())
	}

	var pruneRes map[string]interface{}
	_ = json.Unmarshal(pruneRec.Body.Bytes(), &pruneRes)
	if pruneRes["pruned_records"].(float64) != 3 {
		t.Fatalf("expected 3 pruned records via HTTP endpoint, got %v", pruneRes["pruned_records"])
	}
}

func TestLoginRateLimiting(t *testing.T) {
	api := NewAPIHandler(nil, "test_secret_key")
	api.loginLimiter = newIPRateLimiter(3, 1*time.Minute)

	loginBody := []byte(`{"username":"admin","password":"wrongpassword"}`)

	// First 3 requests should reach handler logic (returns 401 Unauthorized for wrong password)
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewBuffer(loginBody))
		req.RemoteAddr = "192.168.1.100:12345"
		rec := httptest.NewRecorder()
		api.Login(rec, req)

		if rec.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d was unexpectedly rate limited", i+1)
		}
	}

	// 4th request must be rate limited with 429 Too Many Requests
	req := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewBuffer(loginBody))
	req.RemoteAddr = "192.168.1.100:12345"
	rec := httptest.NewRecorder()
	api.Login(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 Too Many Requests on 4th attempt, got %d", rec.Code)
	}

	// Different IP should still be allowed
	reqDiff := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewBuffer(loginBody))
	reqDiff.RemoteAddr = "192.168.1.101:12345"
	recDiff := httptest.NewRecorder()
	api.Login(recDiff, reqDiff)

	if recDiff.Code == http.StatusTooManyRequests {
		t.Fatalf("different IP should not be rate limited")
	}
}

// TestSecurityFix_JWTPriorityOverAdminKey validates that a regular user's JWT token
// cannot be accidentally or maliciously elevated by passing an X-API-Key header.
func TestSecurityFix_JWTPriorityOverAdminKey(t *testing.T) {
	api := NewAPIHandler(nil, "master_admin_secret_key")

	// 1. Register and login regular user
	regPayload, _ := json.Marshal(models.RegisterRequest{
		Name:     "Regular Bob",
		Username: "bob",
		Email:    "bob@example.com",
		Mobile:   "+1-555-0123",
		Password: "password123",
	})
	regReq := httptest.NewRequest("POST", "/api/v1/auth/register", bytes.NewBuffer(regPayload))
	regRec := httptest.NewRecorder()
	api.Register(regRec, regReq)

	var regRes models.LoginResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &regRes)
	userToken := regRes.Token

	// 2. Make a request providing BOTH the user's Bearer JWT and the Master Admin API Key
	req := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+userToken)
	req.Header.Set("X-API-Key", "master_admin_secret_key")

	caller := api.getCaller(req)
	if caller == nil {
		t.Fatalf("expected non-nil caller")
	}

	// Must resolve to Bob (user role), NOT System Administrator (admin role)
	if caller.Role != "user" {
		t.Errorf("expected caller role 'user', got %s", caller.Role)
	}
	if caller.Username != "bob" {
		t.Errorf("expected caller username 'bob', got %s", caller.Username)
	}
}

// TestSecurityFix_UnauthenticatedAccessBlocked validates that sensitive endpoints
// return 401 Unauthorized when accessed without valid credentials.
func TestSecurityFix_UnauthenticatedAccessBlocked(t *testing.T) {
	api := NewAPIHandler(nil, "master_admin_secret_key")

	endpoints := []struct {
		name    string
		handler http.HandlerFunc
		method  string
		url     string
	}{
		{"GetDevices", api.GetDevices, "GET", "/api/v1/devices"},
		{"GetTenants", api.GetTenants, "GET", "/api/v1/tenants"},
		{"GetChannels", api.GetChannels, "GET", "/api/v1/channels"},
		{"GetRules", api.GetRules, "GET", "/api/v1/rules"},
		{"GetAlarms", api.GetAlarms, "GET", "/api/v1/alarms"},
		{"GetLatestTelemetry", api.GetLatestTelemetry, "GET", "/api/v1/devices/any-dev/telemetry/latest"},
		{"GetTelemetryHistory", api.GetTelemetryHistory, "GET", "/api/v1/devices/any-dev/telemetry/history"},
		{"ExportTelemetry", api.ExportTelemetry, "GET", "/api/v1/devices/any-dev/telemetry/export"},
	}

	for _, ep := range endpoints {
		t.Run(ep.name, func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.url, nil)
			req.SetPathValue("id", "any-dev")
			rec := httptest.NewRecorder()
			ep.handler(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Errorf("%s: expected 401 Unauthorized for unauthenticated request, got %d", ep.name, rec.Code)
			}
		})
	}
}

// TestSecurityFix_TenantDeletionGuard validates that regular users cannot delete
// the default organization workspace or workspaces owned by others.
func TestSecurityFix_TenantDeletionGuard(t *testing.T) {
	api := NewAPIHandler(nil, "master_admin_secret_key")

	// 1. Register regular user Alice
	regPayload, _ := json.Marshal(models.RegisterRequest{
		Name:     "Alice Smith",
		Username: "alice",
		Email:    "alice@example.com",
		Mobile:   "+1-555-0144",
		Password: "password123",
	})
	regReq := httptest.NewRequest("POST", "/api/v1/auth/register", bytes.NewBuffer(regPayload))
	regRec := httptest.NewRecorder()
	api.Register(regRec, regReq)

	var regRes models.LoginResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &regRes)
	aliceToken := regRes.Token

	// 2. Alice tries to delete the system Default Organization -> MUST BE 403 FORBIDDEN
	delDefaultReq := httptest.NewRequest("DELETE", "/api/v1/tenants/default-org", nil)
	delDefaultReq.SetPathValue("id", "default-org")
	delDefaultReq.Header.Set("Authorization", "Bearer "+aliceToken)
	delDefaultRec := httptest.NewRecorder()
	api.DeleteTenant(delDefaultRec, delDefaultReq)

	if delDefaultRec.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden when regular user attempts to delete default-org, got %d", delDefaultRec.Code)
	}

	// 3. Alice creates her own workspace
	wsPayload, _ := json.Marshal(models.Tenant{
		Name: "Alice Personal Lab",
		Slug: "alice-lab",
	})
	createReq := httptest.NewRequest("POST", "/api/v1/tenants", bytes.NewBuffer(wsPayload))
	createReq.Header.Set("Authorization", "Bearer "+aliceToken)
	createRec := httptest.NewRecorder()
	api.CreateTenant(createRec, createReq)

	var createRes map[string]interface{}
	_ = json.Unmarshal(createRec.Body.Bytes(), &createRes)
	tenantObj := createRes["tenant"].(map[string]interface{})
	aliceTenantID := tenantObj["id"].(string)

	// 4. Bob registers and tries to delete Alice's workspace -> MUST BE 403 FORBIDDEN
	bobRegPayload, _ := json.Marshal(models.RegisterRequest{
		Name:     "Bob Hacker",
		Username: "bob_hacker",
		Email:    "bob_hacker@example.com",
		Mobile:   "+1-555-0199",
		Password: "password123",
	})
	bobRegReq := httptest.NewRequest("POST", "/api/v1/auth/register", bytes.NewBuffer(bobRegPayload))
	bobRegRec := httptest.NewRecorder()
	api.Register(bobRegRec, bobRegReq)
	var bobRegRes models.LoginResponse
	_ = json.Unmarshal(bobRegRec.Body.Bytes(), &bobRegRes)

	delOtherReq := httptest.NewRequest("DELETE", "/api/v1/tenants/"+aliceTenantID, nil)
	delOtherReq.SetPathValue("id", aliceTenantID)
	delOtherReq.Header.Set("Authorization", "Bearer "+bobRegRes.Token)
	delOtherRec := httptest.NewRecorder()
	api.DeleteTenant(delOtherRec, delOtherReq)

	if delOtherRec.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden when user attempts to delete another user's workspace, got %d", delOtherRec.Code)
	}

	// 5. Alice deletes her own workspace -> MUST SUCCEED (200 OK)
	delAliceReq := httptest.NewRequest("DELETE", "/api/v1/tenants/"+aliceTenantID, nil)
	delAliceReq.SetPathValue("id", aliceTenantID)
	delAliceReq.Header.Set("Authorization", "Bearer "+aliceToken)
	delAliceRec := httptest.NewRecorder()
	api.DeleteTenant(delAliceRec, delAliceReq)

	if delAliceRec.Code != http.StatusOK {
		t.Errorf("expected 200 OK when owner deletes their own workspace, got %d", delAliceRec.Code)
	}
}
