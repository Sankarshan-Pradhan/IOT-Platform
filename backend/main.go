package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"iot-backend/backend/handlers"
	"iot-backend/backend/mqtt"
	"iot-backend/backend/redis"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

type Config struct {
	DBHost               string
	DBPort               string
	DBUser               string
	DBPassword           string
	DBName               string
	RedisHost            string
	RedisPort            string
	RedisPassword        string
	FCMServerKey         string
	FCMCredentialsFile   string
	FCMServiceAccountJSON string
	MQTTBrokerURL        string
	MQTTClientID         string
	ServerPort           string
	AdminAPIKey          string
	MaxTelemetryRecords  int
	PruneIntervalSeconds int
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

	maxTelemetryStr := getEnv("MAX_TELEMETRY_RECORDS", "10000")
	maxTelemetry, err := strconv.Atoi(maxTelemetryStr)
	if err != nil || maxTelemetry <= 0 {
		maxTelemetry = 10000
	}

	pruneIntervalStr := getEnv("TELEMETRY_PRUNE_INTERVAL_SEC", "30")
	pruneInterval, err := strconv.Atoi(pruneIntervalStr)
	if err != nil || pruneInterval <= 0 {
		pruneInterval = 30
	}

	return Config{
		DBHost:               getEnv("POSTGRES_HOST", "localhost"),
		DBPort:               getEnv("POSTGRES_PORT", "5433"),
		DBUser:               getEnv("POSTGRES_USER", "iot_user"),
		DBPassword:           getEnv("POSTGRES_PASSWORD", "iot_secure_password"),
		DBName:               getEnv("POSTGRES_DB", "iot_platform"),
		RedisHost:            getEnv("REDIS_HOST", "localhost"),
		RedisPort:            getEnv("REDIS_PORT", "6379"),
		RedisPassword:        getEnv("REDIS_PASSWORD", ""),
		FCMServerKey:         getEnv("FCM_SERVER_KEY", ""),
		FCMCredentialsFile:   getEnv("FCM_CREDENTIALS_FILE", ""),
		FCMServiceAccountJSON: getEnv("FCM_SERVICE_ACCOUNT_JSON", ""),
		MQTTBrokerURL:        getEnv("MQTT_BROKER_URL", defaultBrokerURL),
		MQTTClientID:         getEnv("MQTT_CLIENT_ID", "iot-backend-service"),
		ServerPort:           getEnv("PORT", "8080"),
		AdminAPIKey:          getEnv("ADMIN_API_KEY", "iot_admin_secret_key_2026"),
		MaxTelemetryRecords:  maxTelemetry,
		PruneIntervalSeconds: pruneInterval,
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
	api.SetTelemetryRetention(cfg.MaxTelemetryRecords, cfg.PruneIntervalSeconds)
	log.Printf("[RETENTION] Telemetry retention policy active: max %d records (prune interval: %ds)", cfg.MaxTelemetryRecords, cfg.PruneIntervalSeconds)

	// Initialize Redis High-Speed L1 Cache & Distributed Rate Limiter
	redisAddr := fmt.Sprintf("%s:%s", cfg.RedisHost, cfg.RedisPort)
	cacheSvc := redis.NewCacheService(redisAddr, cfg.RedisPassword, 0)
	api.SetRedisCache(cacheSvc)
	api.SetFCMServerKey(cfg.FCMServerKey)
	api.SetFCMServiceAccount(cfg.FCMCredentialsFile, cfg.FCMServiceAccountJSON)
	if cacheSvc.CheckConnection() {
		log.Printf("[REDIS] High-speed L1 cache connected: %s", redisAddr)
	} else {
		log.Printf("[REDIS] Notice: Redis not yet reachable at %s. Operating with in-memory L1 cache until service connects.", redisAddr)
	}

	// Background worker to auto-reconnect Redis if it restarts or becomes available
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if !cacheSvc.IsConnected() {
				_ = cacheSvc.CheckConnection()
			}
		}
	}()

	// Decouple MQTT from DB: initialize MQTT service with decoupled ingestion processor
	mqttSvc := mqtt.NewMQTTService(cfg.MQTTBrokerURL, cfg.MQTTClientID, api)
	api.SetMQTTPublisher(mqttSvc)
	if err := mqttSvc.Start(); err != nil {
		log.Printf("[MQTT] Notice: Broker not yet connected (%s): %v. Auto-reconnect retry loop active.", cfg.MQTTBrokerURL, err)
	}

	// Background worker to auto-reconnect when Mosquitto starts/becomes available
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if !mqttSvc.IsConnected() {
				if err := mqttSvc.Start(); err == nil {
					log.Printf("[MQTT] Successfully connected to broker: %s", cfg.MQTTBrokerURL)
				}
			}
		}
	}()

	tryConnectDB := func() {
		newDB, err := initDB(cfg)
		if err == nil {
			db = newDB
			api.SetDB(newDB)
			log.Println("[Success] Connected to TimescaleDB/PostgreSQL successfully.")
			// Initial retention prune check upon connecting
			go func() {
				if pruned, err := api.PruneOldTelemetry(cfg.MaxTelemetryRecords); err == nil && pruned > 0 {
					log.Printf("[RETENTION] Initial prune: removed %d old telemetry records exceeding %d cap", pruned, cfg.MaxTelemetryRecords)
				}
			}()
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

	// Background worker to enforce global telemetry retention cap (default 10,000 records)
	go func() {
		ticker := time.NewTicker(time.Duration(cfg.PruneIntervalSeconds) * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if api != nil {
				if pruned, err := api.PruneOldTelemetry(cfg.MaxTelemetryRecords); err == nil && pruned > 0 {
					log.Printf("[RETENTION] Successfully pruned %d old telemetry records (exceeded %d global cap)", pruned, cfg.MaxTelemetryRecords)
				}
			}
		}
	}()

	// Background worker to mark stale devices offline after 60 seconds of telemetry silence
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if api != nil {
				_, _ = api.CheckStaleDevices(60 * time.Second)
			}
		}
	}()

	// HTTP Handlers & Router (Go 1.22+ pattern routing)
	mux := http.NewServeMux()

	// Tenant Management
	mux.HandleFunc("GET /api/v1/tenants", api.AuthMiddleware(api.GetTenants))
	mux.HandleFunc("POST /api/v1/tenants", api.AuthMiddleware(api.CreateTenant))
	mux.HandleFunc("DELETE /api/v1/tenants/{id}", api.AuthMiddleware(api.DeleteTenant))

	// Channel Management
	mux.HandleFunc("GET /api/v1/channels", api.AuthMiddleware(api.GetChannels))
	mux.HandleFunc("POST /api/v1/channels", api.AuthMiddleware(api.CreateChannel))
	mux.HandleFunc("DELETE /api/v1/channels/{id}", api.AuthMiddleware(api.DeleteChannel))

	// Device Registry
	mux.HandleFunc("GET /api/v1/devices", api.AuthMiddleware(api.GetDevices))
	mux.HandleFunc("POST /api/v1/devices", api.AuthMiddleware(api.CreateDevice))

	// Telemetry Queries, Export & Real-Time SSE Event Stream
	mux.HandleFunc("GET /api/v1/devices/{id}/telemetry/latest", api.AuthMiddleware(api.GetLatestTelemetry))
	mux.HandleFunc("GET /api/v1/devices/{id}/telemetry/history", api.AuthMiddleware(api.GetTelemetryHistory))
	mux.HandleFunc("GET /api/v1/devices/{id}/telemetry/export", api.AuthMiddleware(api.ExportTelemetry))
	mux.HandleFunc("GET /api/v1/telemetry/stream", api.StreamTelemetry)
	mux.HandleFunc("GET /api/v1/telemetry/stats", api.GetTelemetryStats)
	mux.HandleFunc("POST /api/v1/telemetry/prune", api.AuthMiddleware(api.PruneTelemetryHTTP))

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
	mux.HandleFunc("GET /api/v1/rules", api.AuthMiddleware(api.GetRules))
	mux.HandleFunc("POST /api/v1/rules", api.AuthMiddleware(api.CreateRule))
	mux.HandleFunc("DELETE /api/v1/rules/{id}", api.AuthMiddleware(api.DeleteRule))

	// Alarms Management
	mux.HandleFunc("GET /api/v1/alarms", api.AuthMiddleware(api.GetAlarms))
	mux.HandleFunc("POST /api/v1/alarms/{id}/acknowledge", api.AuthMiddleware(api.AcknowledgeAlarm))
	mux.HandleFunc("POST /api/v1/alarms/{id}/resolve", api.AuthMiddleware(api.ResolveAlarm))
	mux.HandleFunc("DELETE /api/v1/alarms/{id}", api.AuthMiddleware(api.DeleteAlarm))

	// Alarm Notification Dispatchers (Alert Channels: Slack, Discord, Webhooks)
	mux.HandleFunc("GET /api/v1/notifications/channels", api.AuthMiddleware(api.GetNotificationChannels))
	mux.HandleFunc("POST /api/v1/notifications/channels", api.AuthMiddleware(api.CreateNotificationChannel))
	mux.HandleFunc("DELETE /api/v1/notifications/channels/{id}", api.AuthMiddleware(api.DeleteNotificationChannel))
	mux.HandleFunc("POST /api/v1/notifications/test", api.AuthMiddleware(api.TestNotificationChannel))

	// Firebase Cloud Messaging (FCM) Mobile Push Alerts
	mux.HandleFunc("GET /api/v1/notifications/fcm/config", api.GetFCMConfig)
	mux.HandleFunc("GET /api/v1/notifications/fcm/tokens", api.AuthMiddleware(api.GetFCMTokens))
	mux.HandleFunc("POST /api/v1/notifications/fcm/token", api.AuthMiddleware(api.RegisterFCMToken))
	mux.HandleFunc("DELETE /api/v1/notifications/fcm/token/{id}", api.AuthMiddleware(api.DeleteFCMToken))
	mux.HandleFunc("POST /api/v1/notifications/fcm/test", api.AuthMiddleware(api.TestFCMPush))

	// Redis L1 High-Speed Cache & In-Memory Performance Metrics
	mux.HandleFunc("GET /api/v1/system/cache-stats", api.GetSystemCacheStats)
	mux.HandleFunc("POST /api/v1/system/cache-flush", api.AuthMiddleware(api.FlushSystemCache))

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
				"GET  /api/v1/telemetry/stats",
				"POST /api/v1/telemetry/prune (Protected)",
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
