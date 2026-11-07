package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"iot-backend/backend/handlers"
	"iot-backend/backend/mqtt"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

type Config struct {
	DBHost        string
	DBPort        string
	DBUser        string
	DBPassword    string
	DBName        string
	MQTTBrokerURL string
	MQTTClientID  string
	ServerPort    string
	AdminAPIKey   string
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func loadConfig() Config {
	for _, envPath := range []string{"infra/.env", "../infra/.env", ".env"} {
		if _, err := os.Stat(envPath); err == nil {
			_ = godotenv.Load(envPath)
			break
		}
	}

	mqttPort := getEnv("MQTT_PORT", "1883")
	mqttHost := getEnv("MQTT_HOST", "localhost")
	defaultBrokerURL := fmt.Sprintf("tcp://%s:%s", mqttHost, mqttPort)

	return Config{
		DBHost:        getEnv("POSTGRES_HOST", "localhost"),
		DBPort:        getEnv("POSTGRES_PORT", "5433"),
		DBUser:        getEnv("POSTGRES_USER", "iot_user"),
		DBPassword:    getEnv("POSTGRES_PASSWORD", "iot_secure_password"),
		DBName:        getEnv("POSTGRES_DB", "iot_platform"),
		MQTTBrokerURL: getEnv("MQTT_BROKER_URL", defaultBrokerURL),
		MQTTClientID:  getEnv("MQTT_CLIENT_ID", "iot-backend-service"),
		ServerPort:    getEnv("PORT", "8080"),
		AdminAPIKey:   getEnv("ADMIN_API_KEY", "iot_admin_secret_key_2026"),
	}
}

func initDB(cfg Config) (*sql.DB, error) {
	connStr := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable connect_timeout=3",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName,
	)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, err
	}

	return db, nil
}

func main() {
	cfg := loadConfig()
	log.Println("Starting IoT Backend Service on port 8080...")

	var db *sql.DB
	api := handlers.NewAPIHandler(nil, cfg.AdminAPIKey)

	// Decouple MQTT from DB: initialize MQTT service with decoupled ingestion processor
	mqttSvc := mqtt.NewMQTTService(cfg.MQTTBrokerURL, cfg.MQTTClientID, api)
	api.SetMQTTPublisher(mqttSvc)
	if err := mqttSvc.Start(); err != nil {
		log.Printf("[MQTT] Notice: Broker not yet connected (%s): %v. Auto-reconnect is active.", cfg.MQTTBrokerURL, err)
	}

	tryConnectDB := func() {
		newDB, err := initDB(cfg)
		if err == nil {
			db = newDB
			api.SetDB(newDB)
			log.Println("[Success] Connected to TimescaleDB/PostgreSQL successfully.")
		}
	}

	// Initial database connection attempt
	tryConnectDB()
	if db == nil {
		log.Println("[Notice] TimescaleDB on port 5433 not detected yet. Running with resilient in-memory cache until database is up.")
		log.Println("[Notice] To start database, run: docker compose up -d inside infra/")
	}

	// Background worker to auto-reconnect when TimescaleDB starts
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if db == nil || db.Ping() != nil {
				tryConnectDB()
			}
		}
	}()

	// HTTP Handlers & Router (Go 1.22+ pattern routing)
	mux := http.NewServeMux()

	// Tenant Management
	mux.HandleFunc("GET /api/v1/tenants", api.GetTenants)
	mux.HandleFunc("POST /api/v1/tenants", api.CreateTenant)
	mux.HandleFunc("DELETE /api/v1/tenants/{id}", api.AuthMiddleware(api.DeleteTenant))

	// Channel Management
	mux.HandleFunc("GET /api/v1/channels", api.GetChannels)
	mux.HandleFunc("POST /api/v1/channels", api.CreateChannel)
	mux.HandleFunc("DELETE /api/v1/channels/{id}", api.AuthMiddleware(api.DeleteChannel))

	// Device Registry
	mux.HandleFunc("GET /api/v1/devices", api.GetDevices)
	mux.HandleFunc("POST /api/v1/devices", api.AuthMiddleware(api.CreateDevice))

	// Telemetry Queries, Export & Real-Time SSE Event Stream
	mux.HandleFunc("GET /api/v1/devices/{id}/telemetry/latest", api.GetLatestTelemetry)
	mux.HandleFunc("GET /api/v1/devices/{id}/telemetry/history", api.GetTelemetryHistory)
	mux.HandleFunc("GET /api/v1/devices/{id}/telemetry/export", api.ExportTelemetry)
	mux.HandleFunc("GET /api/v1/telemetry/stream", api.StreamTelemetry)

	// Telemetry Ingestion (HTTP)
	mux.HandleFunc("POST /api/v1/devices/{id}/telemetry", api.IngestDeviceTelemetry)
	mux.HandleFunc("POST /api/v1/telemetry", api.IngestTelemetry)

	// Device Management & Provisioning
	mux.HandleFunc("PATCH /api/v1/devices/{id}", api.AuthMiddleware(api.UpdateDevice))
	mux.HandleFunc("PUT /api/v1/devices/{id}", api.AuthMiddleware(api.UpdateDevice))
	mux.HandleFunc("POST /api/v1/devices/{id}/token", api.AuthMiddleware(api.RegenerateDeviceToken))
	mux.HandleFunc("DELETE /api/v1/devices/{id}", api.AuthMiddleware(api.DeleteDevice))
	mux.HandleFunc("POST /api/v1/devices/reset", api.AuthMiddleware(api.ResetDevices))

	// Downlink Device Control & Actuation Commands
	mux.HandleFunc("POST /api/v1/devices/{id}/commands", api.AuthMiddleware(api.SendCommand))
	mux.HandleFunc("GET /api/v1/devices/{id}/commands", api.AuthMiddleware(api.GetDeviceCommands))
	mux.HandleFunc("POST /api/v1/devices/{id}/command_ack", api.AcknowledgeCommandHTTP)

	// Over-the-Air (OTA) Updates & Firmware Distribution
	mux.HandleFunc("POST /api/v1/devices/{id}/ota", api.AuthMiddleware(api.TriggerDeviceOTA))
	mux.HandleFunc("POST /api/v1/ota/firmware", api.AuthMiddleware(api.UploadFirmware))
	mux.HandleFunc("GET /api/v1/ota/firmware", api.AuthMiddleware(api.ListFirmwares))
	mux.HandleFunc("GET /api/v1/ota/firmware/{filename}", api.GetFirmwareBinary)

	// User Authentication & Management (JWT)
	mux.HandleFunc("POST /api/v1/auth/register", api.Register)
	mux.HandleFunc("POST /api/v1/auth/login", api.Login)
	mux.HandleFunc("GET /api/v1/auth/me", api.AuthMiddleware(api.GetMe))
	mux.HandleFunc("GET /api/v1/users", api.AuthMiddleware(api.GetUsers))
	mux.HandleFunc("DELETE /api/v1/users/{id}", api.AuthMiddleware(api.DeleteUser))

	// Guardrail Threshold Rules Engine
	mux.HandleFunc("GET /api/v1/rules", api.GetRules)
	mux.HandleFunc("POST /api/v1/rules", api.AuthMiddleware(api.CreateRule))
	mux.HandleFunc("DELETE /api/v1/rules/{id}", api.AuthMiddleware(api.DeleteRule))

	// Alarms Management
	mux.HandleFunc("GET /api/v1/alarms", api.GetAlarms)
	mux.HandleFunc("POST /api/v1/alarms/{id}/acknowledge", api.AuthMiddleware(api.AcknowledgeAlarm))
	mux.HandleFunc("POST /api/v1/alarms/{id}/resolve", api.AuthMiddleware(api.ResolveAlarm))
	mux.HandleFunc("DELETE /api/v1/alarms/{id}", api.AuthMiddleware(api.DeleteAlarm))

	// Alarm Notification Dispatchers (Alert Channels: Slack, Discord, Webhooks)
	mux.HandleFunc("GET /api/v1/notifications/channels", api.AuthMiddleware(api.GetNotificationChannels))
	mux.HandleFunc("POST /api/v1/notifications/channels", api.AuthMiddleware(api.CreateNotificationChannel))
	mux.HandleFunc("DELETE /api/v1/notifications/channels/{id}", api.AuthMiddleware(api.DeleteNotificationChannel))
	mux.HandleFunc("POST /api/v1/notifications/test", api.AuthMiddleware(api.TestNotificationChannel))

	// Healthcheck & Root
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		dbStatus := "connected"
		if db == nil || db.Ping() != nil {
			dbStatus = "disconnected"
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "ok",
			"service":   "iot-backend",
			"database":  dbStatus,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"message": "IoT Platform Backend API",
			"version": "1.2.0",
			"endpoints": []string{
				"GET  /health",
				"POST /api/v1/auth/login",
				"GET  /api/v1/auth/me (Protected)",
				"GET  /api/v1/rules",
				"POST /api/v1/rules (Protected)",
				"DELETE /api/v1/rules/{id} (Protected)",
				"GET  /api/v1/alarms",
				"POST /api/v1/alarms/{id}/acknowledge (Protected)",
				"POST /api/v1/alarms/{id}/resolve (Protected)",
				"DELETE /api/v1/alarms/{id} (Protected)",
				"GET  /api/v1/tenants",
				"POST /api/v1/tenants",
				"DELETE /api/v1/tenants/{id} (Protected)",
				"GET  /api/v1/channels",
				"POST /api/v1/channels",
				"DELETE /api/v1/channels/{id} (Protected)",
				"GET  /api/v1/devices",
				"POST /api/v1/devices (Protected)",
				"GET  /api/v1/devices/{id}/telemetry/latest",
				"GET  /api/v1/devices/{id}/telemetry/history",
				"POST /api/v1/devices/{id}/telemetry",
				"POST /api/v1/telemetry",
				"DELETE /api/v1/devices/{id} (Protected)",
				"POST /api/v1/devices/reset (Protected)",
			},
		})
	})

	addr := ":" + cfg.ServerPort
	log.Printf("Server listening on %s (Healthcheck: http://localhost:%s/health)", addr, cfg.ServerPort)

	corsHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-API-Key")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		mux.ServeHTTP(w, r)
	})

	if err := http.ListenAndServe(addr, corsHandler); err != nil {
		log.Fatalf("Server stopped: %v", err)
	}
}
