package mqtt

import (
	"encoding/json"
	"testing"
	"time"
)

type mockMQTTMessage struct {
	topic   string
	payload []byte
}

func (m *mockMQTTMessage) Duplicate() bool   { return false }
func (m *mockMQTTMessage) Qos() byte         { return 1 }
func (m *mockMQTTMessage) Retained() bool    { return false }
func (m *mockMQTTMessage) Topic() string     { return m.topic }
func (m *mockMQTTMessage) MessageID() uint16 { return 1 }
func (m *mockMQTTMessage) Payload() []byte   { return m.payload }
func (m *mockMQTTMessage) Ack()              {}

type mockProcessor struct {
	lastTenantID      string
	lastChannelID     string
	lastDeviceID      string
	lastTelemetryTime time.Time
	lastPayload       []byte
	lastAckDeviceID   string
	lastAckPayload    []byte
	callCount         int
	ackCount          int
}

func (m *mockProcessor) ProcessTelemetry(tenantID, channelID, deviceID string, telemetryTime time.Time, payloadData []byte) error {
	m.lastTenantID = tenantID
	m.lastChannelID = channelID
	m.lastDeviceID = deviceID
	m.lastTelemetryTime = telemetryTime
	m.lastPayload = payloadData
	m.callCount++
	return nil
}

func (m *mockProcessor) ProcessCommandAck(deviceID string, payloadData []byte) error {
	m.lastAckDeviceID = deviceID
	m.lastAckPayload = payloadData
	m.ackCount++
	return nil
}

func TestMQTTMessageParsing_StandardTopic(t *testing.T) {
	proc := &mockProcessor{}
	svc := &MQTTService{processor: proc}

	rawPayload := []byte(`{"temperature_c": 23.4, "humidity_pct": 52.1, "time": "2026-11-04T05:30:00Z"}`)
	msg := &mockMQTTMessage{
		topic:   "devices/esp32-dht22-node1/telemetry",
		payload: rawPayload,
	}

	svc.handleMessage(nil, msg)

	if proc.callCount != 1 {
		t.Fatalf("expected 1 call to ProcessTelemetry, got %d", proc.callCount)
	}

	if proc.lastDeviceID != "esp32-dht22-node1" {
		t.Errorf("expected device ID 'esp32-dht22-node1', got '%s'", proc.lastDeviceID)
	}

	expectedTime, _ := time.Parse(time.RFC3339, "2026-11-04T05:30:00Z")
	if !proc.lastTelemetryTime.Equal(expectedTime) {
		t.Errorf("expected parsed time %v, got %v", expectedTime, proc.lastTelemetryTime)
	}
}

func TestMQTTMessageParsing_TenantAndChannelTopic(t *testing.T) {
	proc := &mockProcessor{}
	svc := &MQTTService{processor: proc}

	rawPayload := []byte(`{"temperature_c": 21.0}`)
	msg := &mockMQTTMessage{
		topic:   "tenants/org-tenant-uuid/channels/chan-cleanroom/devices/esp32-cr-01/telemetry",
		payload: rawPayload,
	}

	svc.handleMessage(nil, msg)

	if proc.callCount != 1 {
		t.Fatalf("expected 1 call to ProcessTelemetry, got %d", proc.callCount)
	}

	if proc.lastTenantID != "org-tenant-uuid" {
		t.Errorf("expected tenant 'org-tenant-uuid', got '%s'", proc.lastTenantID)
	}

	if proc.lastChannelID != "chan-cleanroom" {
		t.Errorf("expected channel 'chan-cleanroom', got '%s'", proc.lastChannelID)
	}

	if proc.lastDeviceID != "esp32-cr-01" {
		t.Errorf("expected device 'esp32-cr-01', got '%s'", proc.lastDeviceID)
	}
}

func TestMQTTMessageParsing_GenericTopicWithEmbeddedDeviceID(t *testing.T) {
	proc := &mockProcessor{}
	svc := &MQTTService{processor: proc}

	rawPayload := []byte(`{"device_id": "esp32-generic-99", "tenant_id": "tenant-custom", "temperature_c": 19.5}`)
	msg := &mockMQTTMessage{
		topic:   "iot/telemetry",
		payload: rawPayload,
	}

	svc.handleMessage(nil, msg)

	if proc.callCount != 1 {
		t.Fatalf("expected 1 call, got %d", proc.callCount)
	}

	if proc.lastDeviceID != "esp32-generic-99" {
		t.Errorf("expected device ID 'esp32-generic-99', got '%s'", proc.lastDeviceID)
	}

	if proc.lastTenantID != "tenant-custom" {
		t.Errorf("expected tenant ID 'tenant-custom', got '%s'", proc.lastTenantID)
	}
}

func TestMQTTMessageParsing_WrappedPayload(t *testing.T) {
	proc := &mockProcessor{}
	svc := &MQTTService{processor: proc}

	rawPayload := []byte(`{
		"device_id": "esp32-wrapped-01",
		"payload": {
			"temperature_c": 26.5,
			"humidity_pct": 45.0
		}
	}`)
	msg := &mockMQTTMessage{
		topic:   "devices/esp32-wrapped-01/telemetry",
		payload: rawPayload,
	}

	svc.handleMessage(nil, msg)

	var extracted map[string]interface{}
	if err := json.Unmarshal(proc.lastPayload, &extracted); err != nil {
		t.Fatalf("failed to unmarshal extracted payload: %v", err)
	}

	if extracted["temperature_c"].(float64) != 26.5 {
		t.Errorf("expected temperature 26.5, got %v", extracted["temperature_c"])
	}
}

func TestMQTTCommandAck(t *testing.T) {
	proc := &mockProcessor{}
	svc := &MQTTService{processor: proc}

	rawAck := []byte(`{"command_id":"cmd-101","status":"ACKNOWLEDGED","result":"Relay energized"}`)
	msg := &mockMQTTMessage{
		topic:   "devices/esp32-dht22-node1/command_ack",
		payload: rawAck,
	}

	svc.handleMessage(nil, msg)

	if proc.ackCount != 1 {
		t.Fatalf("expected 1 call to ProcessCommandAck, got %d", proc.ackCount)
	}

	if proc.lastAckDeviceID != "esp32-dht22-node1" {
		t.Errorf("expected device ID 'esp32-dht22-node1', got '%s'", proc.lastAckDeviceID)
	}
}
