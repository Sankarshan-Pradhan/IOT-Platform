package redis

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
)

// CacheService wraps the Redis client with graceful fallback and telemetry statistics
type CacheService struct {
	client     *redis.Client
	addr       string
	password   string
	db         int
	connected  atomic.Bool
	hits       atomic.Int64
	misses     atomic.Int64
	mu         sync.RWMutex
	memCache   sync.Map // In-memory fallback if Redis is temporarily unreachable
	rateLimits sync.Map // In-memory rate limiting fallback
}

// NewCacheService initializes a new Redis cache service
func NewCacheService(addr, password string, db int) *CacheService {
	cs := &CacheService{
		addr:     addr,
		password: password,
		db:       db,
	}

	cs.initClient()
	return cs
}

func (cs *CacheService) initClient() {
	if cs.addr == "" {
		cs.addr = "localhost:6379"
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:            cs.addr,
		Password:        cs.password,
		DB:              cs.db,
		DialTimeout:     2 * time.Second,
		ReadTimeout:     1 * time.Second,
		WriteTimeout:    1 * time.Second,
		PoolSize:        20,
		MinIdleConns:    5,
		MaxRetries:      2,
		ConnMaxLifetime: 10 * time.Minute,
	})

	cs.client = rdb
	cs.CheckConnection()
}

// CheckConnection pings the Redis server and updates connectivity state
func (cs *CacheService) CheckConnection() bool {
	if cs.client == nil {
		cs.connected.Store(false)
		return false
	}

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	err := cs.client.Ping(ctx).Err()
	isOk := (err == nil)
	wasOk := cs.connected.Swap(isOk)

	if isOk && !wasOk {
		log.Printf("[REDIS] Connected successfully to Redis server at %s (DB %d)", cs.addr, cs.db)
	} else if !isOk && wasOk {
		log.Printf("[REDIS] Notice: Redis connection lost at %s: %v. Falling back to in-memory L1 cache.", cs.addr, err)
	}

	return isOk
}

// IsConnected returns whether the Redis client is currently reachable
func (cs *CacheService) IsConnected() bool {
	return cs.connected.Load()
}

// telemetryKey formats the cache key for latest device telemetry
func telemetryKey(tenantID, deviceID string) string {
	return fmt.Sprintf("iot:telemetry:latest:%s:%s", tenantID, deviceID)
}

// GetLatestTelemetry retrieves the latest telemetry snapshot from Redis or memory fallback
func (cs *CacheService) GetLatestTelemetry(tenantID, deviceID string) ([]byte, bool) {
	key := telemetryKey(tenantID, deviceID)

	if cs.IsConnected() {
		ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
		defer cancel()

		val, err := cs.client.Get(ctx, key).Bytes()
		if err == nil {
			cs.hits.Add(1)
			return val, true
		}
	}

	// In-memory fallback
	if val, ok := cs.memCache.Load(key); ok {
		if b, ok := val.([]byte); ok {
			cs.hits.Add(1)
			return b, true
		}
	}

	cs.misses.Add(1)
	return nil, false
}

// SetLatestTelemetry caches the latest telemetry record with an expiration TTL
func (cs *CacheService) SetLatestTelemetry(tenantID, deviceID string, payload []byte, ttl time.Duration) error {
	key := telemetryKey(tenantID, deviceID)

	// Always store in fast memory cache
	cs.memCache.Store(key, payload)

	if cs.IsConnected() {
		ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
		defer cancel()

		if ttl <= 0 {
			ttl = 24 * time.Hour
		}
		return cs.client.Set(ctx, key, payload, ttl).Err()
	}

	return nil
}

// CheckRateLimit enforces distributed sliding-window or fixed-window rate limiting
func (cs *CacheService) CheckRateLimit(key string, maxAttempts int, window time.Duration) (bool, int, error) {
	rateKey := fmt.Sprintf("iot:ratelimit:%s", key)

	if cs.IsConnected() {
		ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
		defer cancel()

		count, err := cs.client.Incr(ctx, rateKey).Result()
		if err != nil {
			return true, maxAttempts, err
		}

		// First hit in this window: set expiration
		if count == 1 {
			_ = cs.client.Expire(ctx, rateKey, window).Err()
		}

		remaining := maxAttempts - int(count)
		if remaining < 0 {
			remaining = 0
		}

		return count <= int64(maxAttempts), remaining, nil
	}

	// In-memory fallback rate limiter
	type rateEntry struct {
		count     int
		expiresAt time.Time
	}

	now := time.Now()
	val, loaded := cs.rateLimits.Load(rateKey)
	if !loaded {
		cs.rateLimits.Store(rateKey, rateEntry{count: 1, expiresAt: now.Add(window)})
		return true, maxAttempts - 1, nil
	}

	entry := val.(rateEntry)
	if now.After(entry.expiresAt) {
		cs.rateLimits.Store(rateKey, rateEntry{count: 1, expiresAt: now.Add(window)})
		return true, maxAttempts - 1, nil
	}

	entry.count++
	cs.rateLimits.Store(rateKey, entry)
	remaining := maxAttempts - entry.count
	if remaining < 0 {
		remaining = 0
	}
	return entry.count <= maxAttempts, remaining, nil
}

// GetStats returns comprehensive performance and health metrics for the Redis engine
func (cs *CacheService) GetStats() map[string]interface{} {
	connected := cs.CheckConnection()
	hits := cs.hits.Load()
	misses := cs.misses.Load()
	total := hits + misses

	hitRatio := 0.0
	if total > 0 {
		hitRatio = (float64(hits) / float64(total)) * 100.0
	}

	var dbSize int64 = 0
	var memoryUsed string = "In-Memory"
	var uptimeSec int64 = 0

	if connected && cs.client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		if size, err := cs.client.DBSize(ctx).Result(); err == nil {
			dbSize = size
		}

		if info, err := cs.client.Info(ctx, "memory").Result(); err == nil {
			for _, line := range strings.Split(info, "\r\n") {
				if strings.HasPrefix(line, "used_memory_human:") {
					memoryUsed = strings.TrimPrefix(line, "used_memory_human:")
					break
				}
			}
		}

		if info, err := cs.client.Info(ctx, "server").Result(); err == nil {
			for _, line := range strings.Split(info, "\r\n") {
				if strings.HasPrefix(line, "uptime_in_seconds:") {
					fmt.Sscanf(line, "uptime_in_seconds:%d", &uptimeSec)
					break
				}
			}
		}
	} else {
		// Count items in memCache
		var memCount int64 = 0
		cs.memCache.Range(func(_, _ interface{}) bool {
			memCount++
			return true
		})
		dbSize = memCount
		memoryUsed = fmt.Sprintf("~%d KB (RAM)", (memCount*1024)/1000+10)
	}

	return map[string]interface{}{
		"connected":         connected,
		"server_address":    cs.addr,
		"storage_mode":      func() string { if connected { return "redis_v7" } else { return "memory_fallback" } }(),
		"total_keys":        dbSize,
		"memory_used_human": memoryUsed,
		"cache_hits":        hits,
		"cache_misses":      misses,
		"total_requests":    total,
		"hit_ratio_percent": fmt.Sprintf("%.1f%%", hitRatio),
		"uptime_seconds":    uptimeSec,
	}
}

// FlushAll removes all cached IoT keys
func (cs *CacheService) FlushAll() error {
	// Clear memory cache
	cs.memCache = sync.Map{}
	cs.rateLimits = sync.Map{}

	if cs.IsConnected() && cs.client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		// Scan and delete keys starting with iot:*
		var cursor uint64
		for {
			var keys []string
			var err error
			keys, cursor, err = cs.client.Scan(ctx, cursor, "iot:*", 100).Result()
			if err != nil {
				return err
			}
			if len(keys) > 0 {
				_ = cs.client.Del(ctx, keys...).Err()
			}
			if cursor == 0 {
				break
			}
		}
	}

	return nil
}
