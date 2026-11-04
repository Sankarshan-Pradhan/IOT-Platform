package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"iot-backend/backend/models"
)

func TestGetTenants(t *testing.T) {
	api := NewAPIHandler(nil, "test_secret_key")

	req := httptest.NewRequest("GET", "/api/v1/tenants", nil)
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
	latestRec := httptest.NewRecorder()

	api.GetLatestTelemetry(latestRec, latestReq)

	if latestRec.Code != http.StatusOK {
		t.Fatalf("expected status 200 for latest telemetry, got %d", latestRec.Code)
	}

	// 4. Fetch telemetry history
	histReq := httptest.NewRequest("GET", "/api/v1/devices/esp32-test-node/telemetry/history?limit=10&order=ASC", nil)
	histReq.SetPathValue("id", "esp32-test-node")
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
	createTenantRec := httptest.NewRecorder()
	api.CreateTenant(createTenantRec, createTenantReq)

	var res map[string]interface{}
	_ = json.Unmarshal(createTenantRec.Body.Bytes(), &res)
	tenantObj := res["tenant"].(map[string]interface{})
	tenantID := tenantObj["id"].(string)

	delTenantReq := httptest.NewRequest("DELETE", "/api/v1/tenants/"+tenantID, nil)
	delTenantReq.SetPathValue("id", tenantID)
	delTenantRec := httptest.NewRecorder()
	api.DeleteTenant(delTenantRec, delTenantReq)

	if delTenantRec.Code != http.StatusOK {
		t.Fatalf("expected status 200 for DeleteTenant, got %d", delTenantRec.Code)
	}

	// 2. Create and delete channel
	createChanReq := httptest.NewRequest("POST", "/api/v1/channels", bytes.NewBuffer([]byte(`{"name": "Temporary Channel"}`)))
	createChanRec := httptest.NewRecorder()
	api.CreateChannel(createChanRec, createChanReq)

	var chanRes map[string]interface{}
	_ = json.Unmarshal(createChanRec.Body.Bytes(), &chanRes)
	chanObj := chanRes["channel"].(map[string]interface{})
	channelID := chanObj["id"].(string)

	delChanReq := httptest.NewRequest("DELETE", "/api/v1/channels/"+channelID, nil)
	delChanReq.SetPathValue("id", channelID)
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
	createRuleRec := httptest.NewRecorder()
	api.CreateRule(createRuleRec, createRuleReq)

	if createRuleRec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for CreateRule, got %d: %s", createRuleRec.Code, createRuleRec.Body.String())
	}

	// 6. Ingest humidity exceeding custom rule (86.0% > 80.0%)
	humPayload := []byte(`{"temperature_c": 22.0, "humidity_pct": 86.0}`)
	_ = api.ProcessTelemetry("a0000000-0000-0000-0000-000000000001", "", "test-node-humid", time.Now().UTC(), humPayload)

	humAlarmsReq := httptest.NewRequest("GET", "/api/v1/alarms?device_id=test-node-humid&status=OPEN", nil)
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

	// 3. User fetches their workspaces: should only see their own created workspace
	userTenantsReq := httptest.NewRequest("GET", "/api/v1/tenants", nil)
	userTenantsReq.Header.Set("Authorization", "Bearer "+userToken)
	userTenantsRec := httptest.NewRecorder()
	api.GetTenants(userTenantsRec, userTenantsReq)

	var userTenantsRes map[string]interface{}
	_ = json.Unmarshal(userTenantsRec.Body.Bytes(), &userTenantsRes)
	tenantsList := userTenantsRes["tenants"].([]interface{})
	if len(tenantsList) != 1 {
		t.Fatalf("expected regular user to only see their 1 created workspace, got %d", len(tenantsList))
	}
	firstWS := tenantsList[0].(map[string]interface{})
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
}
