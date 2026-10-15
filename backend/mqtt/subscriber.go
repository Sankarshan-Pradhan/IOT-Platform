package mqtt

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"
)

type MQTTService struct {
	client paho.Client
	db     *sql.DB
}

type Config struct {
	BrokerURL string
	ClientID  string
}

func NewMQTTService(brokerURL, clientID string, db *sql.DB) *MQTTService {
	svc := &MQTTService{db: db}

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

func (s *MQTTService) Start() error {
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

func (s *MQTTService) subscribe() {
	topics := map[string]byte{
		"devices/+/telemetry":           1,
		"tenants/+/devices/+/telemetry": 1,
		"iot/telemetry":                 1,
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

	var tenantID string
	var deviceID string

	parts := strings.Split(topic, "/")
	if len(parts) == 3 && parts[0] == "devices" && parts[2] == "telemetry" {
		deviceID = parts[1]
	} else if len(parts) == 5 && parts[0] == "tenants" && parts[2] == "devices" && parts[4] == "telemetry" {
		tenantID = parts[1]
		deviceID = parts[3]
	}

	var rawObj map[string]interface{}
	if err := json.Unmarshal(payload, &rawObj); err != nil {
		log.Printf("[MQTT] Warning: Non-JSON payload received on topic %s: %s", topic, string(payload))
		return
	}

	// If deviceID was not in topic (e.g. iot/telemetry), try reading from payload
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

	// Parse timestamp if present
	telemetryTime := time.Now().UTC()
	for _, timeField := range []string{"time", "timestamp", "ts"} {
		if tVal, exists := rawObj[timeField]; exists {
			switch val := tVal.(type) {
			case string:
				if parsed, err := time.Parse(time.RFC3339, val); err == nil {
					telemetryTime = parsed
				}
			case float64: // Unix timestamp in seconds or milliseconds
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

	// Resolve or auto-register device
	resolvedTenantID, err := s.ensureDevice(tenantID, deviceID)
	if err != nil {
		log.Printf("[MQTT] Failed to ensure device %s: %v", deviceID, err)
		return
	}

	// Insert into telemetry table
	query := `
		INSERT INTO telemetry (time, tenant_id, device_id, payload)
		VALUES ($1, $2, $3, $4);
	`
	if _, err := s.db.Exec(query, telemetryTime, resolvedTenantID, deviceID, sensorPayload); err != nil {
		log.Printf("[MQTT] Error inserting telemetry for %s: %v", deviceID, err)
		return
	}

	// Update device status to online
	_, _ = s.db.Exec(
		"UPDATE devices SET status = 'online', updated_at = NOW() WHERE tenant_id = $1 AND device_id = $2",
		resolvedTenantID, deviceID,
	)

	log.Printf("[MQTT] Successfully ingested telemetry for device: %s (time: %s)", deviceID, telemetryTime.Format(time.RFC3339))
}

func (s *MQTTService) ensureDevice(tenantID, deviceID string) (string, error) {
	// Check if device already exists
	var existingTenantID string
	checkQuery := `SELECT tenant_id FROM devices WHERE device_id = $1 LIMIT 1;`
	err := s.db.QueryRow(checkQuery, deviceID).Scan(&existingTenantID)
	if err == nil {
		return existingTenantID, nil
	}

	// Default tenant if none provided
	if tenantID == "" {
		tenantID = "a0000000-0000-0000-0000-000000000001"
	}

	insertQuery := `
		INSERT INTO devices (tenant_id, device_id, name, device_type, status)
		VALUES ($1, $2, $2, 'generic', 'online')
		ON CONFLICT (tenant_id, device_id) DO UPDATE SET status = 'online', updated_at = NOW()
		RETURNING tenant_id;
	`
	var retTenantID string
	err = s.db.QueryRow(insertQuery, tenantID, deviceID).Scan(&retTenantID)
	if err != nil {
		return "", fmt.Errorf("failed to auto-register device: %w", err)
	}
	return retTenantID, nil
}
