package mqtt

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"
)

// IngestionProcessor interface allows MQTT service to ingest data and command acknowledgments
// into either memory cache or TimescaleDB without coupling to the database.
type IngestionProcessor interface {
	ProcessTelemetry(tenantID, channelID, deviceID string, telemetryTime time.Time, payloadData []byte) error
	ProcessCommandAck(deviceID string, payloadData []byte) error
	ProcessDeviceStatus(tenantID, deviceID, status string) error
}

type MQTTService struct {
	client    paho.Client
	processor IngestionProcessor
}

func NewMQTTService(brokerURL, clientID string, processor IngestionProcessor) *MQTTService {
	svc := &MQTTService{processor: processor}

	opts := paho.NewClientOptions()
	opts.AddBroker(brokerURL)
	opts.SetClientID(clientID)
	opts.SetAutoReconnect(true)
	opts.SetKeepAlive(60 * time.Second)
	opts.SetPingTimeout(10 * time.Second)
	opts.SetCleanSession(true)

	opts.OnConnect = func(c paho.Client) {
		log.Printf("[MQTT] Connected to broker: %s", brokerURL)
		svc.subscribe()
	}

	opts.OnConnectionLost = func(c paho.Client, err error) {
		log.Printf("[MQTT] Connection lost: %v. Reconnecting...", err)
	}

	svc.client = paho.NewClient(opts)
	return svc
}

func (s *MQTTService) IsConnected() bool {
	return s.client != nil && s.client.IsConnected()
}

func (s *MQTTService) Start() error {
	if s.client == nil {
		return fmt.Errorf("mqtt client not initialized")
	}
	if s.client.IsConnected() {
		return nil
	}
	if token := s.client.Connect(); token.Wait() && token.Error() != nil {
		return token.Error()
	}
	return nil
}

func (s *MQTTService) Stop() {
	if s.client != nil && s.client.IsConnected() {
		s.client.Disconnect(250)
		log.Println("[MQTT] Disconnected from broker.")
	}
}

// PublishCommand sends a downlink command to the specific device on devices/{id}/commands
func (s *MQTTService) PublishCommand(deviceID string, cmdPayload []byte) error {
	if s.client == nil || !s.client.IsConnected() {
		return nil // Non-fatal if broker is not connected in resilient standalone mode
	}
	topic := "devices/" + deviceID + "/commands"
	token := s.client.Publish(topic, 1, false, cmdPayload)
	token.Wait()
	return token.Error()
}

func (s *MQTTService) subscribe() {
	topics := map[string]byte{
		"devices/+/telemetry":                           1,
		"tenants/+/devices/+/telemetry":                 1,
		"channels/+/telemetry":                          1,
		"tenants/+/channels/+/devices/+/telemetry":      1,
		"iot/telemetry":                                 1,
		"devices/+/command_ack":                         1,
		"tenants/+/devices/+/command_ack":               1,
		"devices/+/status":                              1,
		"tenants/+/devices/+/status":                    1,
	}

	for topic, qos := range topics {
		if token := s.client.Subscribe(topic, qos, s.handleMessage); token.Wait() && token.Error() != nil {
			log.Printf("[MQTT] Failed to subscribe to topic %s: %v", topic, token.Error())
		} else {
			log.Printf("[MQTT] Subscribed to topic: %s", topic)
		}
	}
}

func (s *MQTTService) handleMessage(client paho.Client, msg paho.Message) {
	topic := msg.Topic()
	payload := msg.Payload()

	// Handle device online / offline status (LWT and status heartbeats)
	if strings.HasSuffix(topic, "/status") {
		parts := strings.Split(topic, "/")
		var devID, tID string
		if len(parts) >= 2 && parts[0] == "devices" {
			devID = parts[1]
		} else if len(parts) >= 4 && parts[0] == "tenants" {
			tID = parts[1]
			devID = parts[3]
		}
		statusStr := strings.TrimSpace(string(payload))
		if strings.HasPrefix(statusStr, "{") {
			var statusObj struct {
				Status string `json:"status"`
			}
			if err := json.Unmarshal(payload, &statusObj); err == nil && statusObj.Status != "" {
				statusStr = statusObj.Status
			}
		}
		statusStr = strings.ToLower(statusStr)
		if statusStr != "online" && statusStr != "offline" {
			statusStr = "offline"
		}
		if s.processor != nil && devID != "" {
			_ = s.processor.ProcessDeviceStatus(tID, devID, statusStr)
		}
		log.Printf("[MQTT] Ingested device status for %s: %s", devID, statusStr)
		return
	}

	// Handle command acknowledgments from hardware devices
	if strings.HasSuffix(topic, "/command_ack") {
		parts := strings.Split(topic, "/")
		var devID string
		if len(parts) >= 2 && parts[0] == "devices" {
			devID = parts[1]
		} else if len(parts) >= 4 && parts[0] == "tenants" {
			devID = parts[3]
		}
		if s.processor != nil {
			_ = s.processor.ProcessCommandAck(devID, payload)
		}
		log.Printf("[MQTT] Ingested command acknowledgment from device: %s", devID)
		return
	}

	var tenantID string
	var channelID string
	var deviceID string

	parts := strings.Split(topic, "/")
	if len(parts) == 3 && parts[0] == "devices" && parts[2] == "telemetry" {
		deviceID = parts[1]
	} else if len(parts) == 5 && parts[0] == "tenants" && parts[2] == "devices" && parts[4] == "telemetry" {
		tenantID = parts[1]
		deviceID = parts[3]
	} else if len(parts) == 3 && parts[0] == "channels" && parts[2] == "telemetry" {
		channelID = parts[1]
	} else if len(parts) == 7 && parts[0] == "tenants" && parts[2] == "channels" && parts[4] == "devices" && parts[6] == "telemetry" {
		tenantID = parts[1]
		channelID = parts[3]
		deviceID = parts[5]
	}

	var rawObj map[string]interface{}
	if err := json.Unmarshal(payload, &rawObj); err != nil {
		log.Printf("[MQTT] Warning: Non-JSON payload received on topic %s: %s", topic, string(payload))
		return
	}

	// Read deviceID from payload if not in topic
	if deviceID == "" {
		if d, ok := rawObj["device_id"].(string); ok && d != "" {
			deviceID = d
		} else if d, ok := rawObj["id"].(string); ok && d != "" {
			deviceID = d
		}
	}

	if deviceID == "" {
		log.Printf("[MQTT] Warning: Missing device_id in topic %s and payload", topic)
		return
	}

	if tenantID == "" {
		if t, ok := rawObj["tenant_id"].(string); ok && t != "" {
			tenantID = t
		}
	}

	if channelID == "" {
		if c, ok := rawObj["channel_id"].(string); ok && c != "" {
			channelID = c
		}
	}

	// Parse timestamp if present
	telemetryTime := time.Now().UTC()
	for _, timeField := range []string{"time", "timestamp", "ts"} {
		if tVal, exists := rawObj[timeField]; exists {
			switch val := tVal.(type) {
			case string:
				if parsed, err := time.Parse(time.RFC3339, val); err == nil {
					telemetryTime = parsed
				}
			case float64:
				if val > 1e12 {
					telemetryTime = time.UnixMilli(int64(val)).UTC()
				} else {
					telemetryTime = time.Unix(int64(val), 0).UTC()
				}
			}
			break
		}
	}

	// Determine sensor payload
	var sensorPayload []byte
	if wrapped, ok := rawObj["payload"]; ok {
		sensorPayload, _ = json.Marshal(wrapped)
	} else if data, ok := rawObj["data"]; ok {
		sensorPayload, _ = json.Marshal(data)
	} else {
		sensorPayload = payload
	}

	// Process telemetry via decoupled ingestion processor
	if s.processor != nil {
		if err := s.processor.ProcessTelemetry(tenantID, channelID, deviceID, telemetryTime, sensorPayload); err != nil {
			log.Printf("[MQTT] Error processing telemetry for %s: %v", deviceID, err)
			return
		}
	}

	log.Printf("[MQTT] Ingested telemetry for device: %s (time: %s)", deviceID, telemetryTime.Format(time.RFC3339))
}
