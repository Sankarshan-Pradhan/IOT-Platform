package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// SSEBroker manages real-time Server-Sent Event client subscriptions
type SSEBroker struct {
	clients map[chan []byte]bool
	mu      sync.RWMutex
}

// NewSSEBroker initializes a new SSE event broker
func NewSSEBroker() *SSEBroker {
	return &SSEBroker{
		clients: make(map[chan []byte]bool),
	}
}

// AddClient registers a new subscriber channel
func (b *SSEBroker) AddClient() chan []byte {
	b.mu.Lock()
	defer b.mu.Unlock()
	ch := make(chan []byte, 64)
	b.clients[ch] = true
	return ch
}

// RemoveClient unregisters and closes a subscriber channel
func (b *SSEBroker) RemoveClient(ch chan []byte) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, ok := b.clients[ch]; ok {
		delete(b.clients, ch)
		close(ch)
	}
}

// Broadcast dispatches an SSE event formatted message to all active clients
func (b *SSEBroker) Broadcast(eventType string, data interface{}) {
	payload, err := json.Marshal(data)
	if err != nil {
		return
	}
	msg := []byte(fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, payload))

	b.mu.RLock()
	defer b.mu.RUnlock()
	for ch := range b.clients {
		select {
		case ch <- msg:
		default:
			// Buffer full, skip to prevent blocking
		}
	}
}

// StreamTelemetry handles GET /api/v1/telemetry/stream
// Delivers zero-latency real-time server-sent events for telemetry, alarms, and downlink ACKs.
func (h *APIHandler) StreamTelemetry(w http.ResponseWriter, r *http.Request) {
	caller := h.getCaller(r)
	if caller == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized: valid session token required for real-time telemetry stream")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "Streaming unsupported by connection")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	clientCh := h.sseBroker.AddClient()
	defer h.sseBroker.RemoveClient(clientCh)

	// Send initial connection handshake
	initPayload, _ := json.Marshal(map[string]interface{}{
		"status":  "connected",
		"message": "Real-time SSE telemetry stream established",
		"time":    time.Now().UTC(),
	})
	_, _ = fmt.Fprintf(w, "event: connected\ndata: %s\n\n", initPayload)
	flusher.Flush()

	ctx := r.Context()
	ticker := time.NewTicker(15 * time.Second) // Keepalive heartbeat
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Send comment heartbeat to keep HTTP connections alive across proxies
			_, err := fmt.Fprintf(w, ": heartbeat %s\n\n", time.Now().UTC().Format(time.RFC3339))
			if err != nil {
				return
			}
			flusher.Flush()
		case msg, ok := <-clientCh:
			if !ok {
				return
			}
			_, err := w.Write(msg)
			if err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
