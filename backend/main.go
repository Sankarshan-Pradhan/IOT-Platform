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
	api := handlers.NewAPIHandler(nil)
	var mqttSvc *mqtt.MQTTService

	tryConnectDB := func() {
		newDB, err := initDB(cfg)
		if err == nil {
			db = newDB
			api.SetDB(newDB)
			log.Println("[Success] Connected to TimescaleDB/PostgreSQL successfully.")

			if mqttSvc == nil {
				mqttSvc = mqtt.NewMQTTService(cfg.MQTTBrokerURL, cfg.MQTTClientID, newDB)
				if err := mqttSvc.Start(); err != nil {
					log.Printf("[MQTT] Waiting for broker (%s): %v", cfg.MQTTBrokerURL, err)
				}
			}
		}
	}

	// Initial connection attempt
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

	// HTTP Handlers & Router
	mux := http.NewServeMux()

	// Device Registry
	mux.HandleFunc("GET /api/v1/devices", api.GetDevices)

	// Telemetry Queries
	mux.HandleFunc("GET /api/v1/devices/{id}/telemetry/latest", api.GetLatestTelemetry)
	mux.HandleFunc("GET /api/v1/devices/{id}/telemetry/history", api.GetTelemetryHistory)

	// Telemetry Ingestion (HTTP)
	mux.HandleFunc("POST /api/v1/devices/{id}/telemetry", api.IngestDeviceTelemetry)
	mux.HandleFunc("POST /api/v1/telemetry", api.IngestTelemetry)

	// Device Management (Delete & Reset)
	mux.HandleFunc("DELETE /api/v1/devices/{id}", api.DeleteDevice)
	mux.HandleFunc("POST /api/v1/devices/reset", api.ResetDevices)

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
			"version": "1.0.0",
			"endpoints": []string{
				"GET  /health",
				"GET  /api/v1/devices",
				"GET  /api/v1/devices/{id}/telemetry/latest",
				"GET  /api/v1/devices/{id}/telemetry/history",
				"POST /api/v1/devices/{id}/telemetry",
				"POST /api/v1/telemetry",
			},
		})
	})

	addr := ":" + cfg.ServerPort
	log.Printf("Server listening on %s (Healthcheck: http://localhost:%s/health)", addr, cfg.ServerPort)

	corsHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
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
