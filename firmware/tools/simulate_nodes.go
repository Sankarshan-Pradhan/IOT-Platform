package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/signal"
	"syscall"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"
)

type TelemetryPayload struct {
	DeviceID     string  `json:"device_id"`
	TenantID     string  `json:"tenant_id"`
	TemperatureC float64 `json:"temperature_c"`
	HumidityPct  float64 `json:"humidity_pct"`
	Seq          uint64  `json:"seq"`
	UptimeS      int64   `json:"uptime_s"`
	WifiRSSI     int     `json:"wifi_rssi"`
}

func main() {
	broker := flag.String("broker", "tcp://localhost:1883", "MQTT Broker URL")
	numNodes := flag.Int("nodes", 2, "Number of ESP32 nodes to simulate (1 or 2)")
	interval := flag.Duration("interval", 5*time.Second, "Publish interval (default 5s)")
	tenantID := flag.String("tenant", "a0000000-0000-0000-0000-000000000001", "Tenant UUID")
	flag.Parse()

	log.Println("==================================================")
	log.Printf("Starting Simulated ESP32 + DHT22 Nodes: %d node(s)\n", *numNodes)
	log.Printf("Broker: %s | Interval: %v\n", *broker, *interval)
	log.Println("==================================================")

	opts := paho.NewClientOptions()
	opts.AddBroker(*broker)
	opts.SetClientID(fmt.Sprintf("esp32-simulator-%d", time.Now().Unix()))
	opts.SetAutoReconnect(true)

	client := paho.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		log.Fatalf("Failed to connect to MQTT broker: %v", token.Error())
	}
	defer client.Disconnect(250)

	log.Println("Connected to MQTT Broker!")

	// Channel for graceful termination
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	ticker := time.NewTicker(*interval)
	defer ticker.Stop()

	seqCounters := make([]uint64, *numNodes)
	startTimes := make([]time.Time, *numNodes)
	for i := 0; i < *numNodes; i++ {
		startTimes[i] = time.Now()
	}

	// Base temperatures & humidities for variety
	baseTemp := []float64{23.5, 26.2}
	baseHum := []float64{52.0, 58.5}

	publishAll := func() {
		for i := 0; i < *numNodes; i++ {
			deviceID := fmt.Sprintf("esp32-dht22-%02d", i+1)
			topic := fmt.Sprintf("devices/%s/telemetry", deviceID)

			seqCounters[i]++
			// Add slight random fluctuation (+/- 0.5 C, +/- 1.0 % humidity)
			tempDrift := (rand.Float64() - 0.5) * 0.8
			humDrift := (rand.Float64() - 0.5) * 1.5

			temp := float64(int((baseTemp[i%2]+tempDrift)*10)) / 10.0
			hum := float64(int((baseHum[i%2]+humDrift)*10)) / 10.0
			rssi := -55 - rand.Intn(15)

			payload := TelemetryPayload{
				DeviceID:     deviceID,
				TenantID:     *tenantID,
				TemperatureC: temp,
				HumidityPct:  hum,
				Seq:          seqCounters[i],
				UptimeS:      int64(time.Since(startTimes[i]).Seconds()),
				WifiRSSI:     rssi,
			}

			data, _ := json.Marshal(payload)
			token := client.Publish(topic, 1, false, data)
			token.Wait()

			log.Printf("[PUB] %s -> %s (%.1f °C, %.1f %%)", topic, string(data), temp, hum)
		}
	}

	// First immediate publish
	publishAll()

	for {
		select {
		case <-ticker.C:
			publishAll()
		case <-sigChan:
			log.Println("\nStopping ESP32 simulation...")
			return
		}
	}
}
