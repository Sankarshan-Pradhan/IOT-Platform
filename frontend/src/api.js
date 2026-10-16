/**
 * API client for IoT Platform Backend
 * Supports both direct backend URL and Vite dev proxy (/api)
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { status: 'error', error: err.message, database: 'disconnected' };
  }
}

export async function fetchDevices(tenantId = '') {
  try {
    const url = tenantId 
      ? `${API_BASE_URL}/api/v1/devices?tenant_id=${encodeURIComponent(tenantId)}`
      : `${API_BASE_URL}/api/v1/devices`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.devices || [];
  } catch (err) {
    console.warn('[API] Could not fetch devices from backend:', err);
    return null;
  }
}

export async function fetchLatestTelemetry(deviceId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/devices/${encodeURIComponent(deviceId)}/telemetry/latest`);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`[API] Failed fetching latest telemetry for ${deviceId}:`, err);
    return null;
  }
}

export async function fetchTelemetryHistory(deviceId, limit = 50, order = 'ASC') {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/v1/devices/${encodeURIComponent(deviceId)}/telemetry/history?limit=${limit}&order=${order}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.history || [];
  } catch (err) {
    console.warn(`[API] Failed fetching telemetry history for ${deviceId}:`, err);
    return [];
  }
}

export async function sendTelemetryHTTP(deviceId, payload) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/devices/${encodeURIComponent(deviceId)}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[API] Failed sending HTTP telemetry:`, err);
    throw err;
  }
}

export async function deleteDevice(deviceId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/devices/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[API] Failed deleting device:`, err);
    throw err;
  }
}

export async function resetAllDevices() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/devices/reset`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[API] Failed resetting devices:`, err);
    throw err;
  }
}
