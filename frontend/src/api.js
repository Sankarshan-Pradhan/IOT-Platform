/**
 * API client for IoT Platform Backend
 * Supports both direct backend URL and Vite dev proxy (/api)
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

function getAuthHeaders() {
  const token = sessionStorage.getItem('iot_jwt_token') || localStorage.getItem('iot_jwt_token');
  const apiKey = localStorage.getItem('iot_api_key') || 'iot_admin_secret_key_2026';
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  headers['X-API-Key'] = apiKey;
  return headers;
}

// ----------------------------------------------------------------------------
// Authentication APIs (JWT & User Profiles)
// ----------------------------------------------------------------------------

export async function register(userData) {
  const res = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Registration failed (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (data.token) {
    sessionStorage.setItem('iot_jwt_token', data.token);
    sessionStorage.setItem('iot_user', JSON.stringify(data.user));
    localStorage.setItem('iot_jwt_token', data.token);
    localStorage.setItem('iot_user', JSON.stringify(data.user));
  }
  return data;
}

export async function login(username, password) {
  const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Authentication failed (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (data.token) {
    sessionStorage.setItem('iot_jwt_token', data.token);
    sessionStorage.setItem('iot_user', JSON.stringify(data.user));
    localStorage.setItem('iot_jwt_token', data.token);
    localStorage.setItem('iot_user', JSON.stringify(data.user));
  }
  return data;
}

export async function fetchMe() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch (e) {
    return null;
  }
}

export async function fetchUsers() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/users`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.users || [];
  } catch (err) {
    console.warn('[API] Could not fetch users list:', err);
    return [];
  }
}

export function logout() {
  sessionStorage.removeItem('iot_jwt_token');
  sessionStorage.removeItem('iot_user');
  localStorage.removeItem('iot_jwt_token');
  localStorage.removeItem('iot_user');
}

export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { status: 'error', error: err.message, database: 'disconnected' };
  }
}

export async function fetchTenants() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/tenants`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.tenants || [];
  } catch (err) {
    console.warn('[API] Could not fetch tenants from backend:', err);
    return null;
  }
}

export async function createTenant(tenantData) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/tenants`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(tenantData),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[API] Failed creating tenant:', err);
    throw err;
  }
}

export async function deleteTenant(tenantId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/tenants/${encodeURIComponent(tenantId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[API] Failed deleting tenant:`, err);
    throw err;
  }
}

export async function fetchChannels(tenantId = '') {
  try {
    const url = tenantId 
      ? `${API_BASE_URL}/api/v1/channels?tenant_id=${encodeURIComponent(tenantId)}`
      : `${API_BASE_URL}/api/v1/channels`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.channels || [];
  } catch (err) {
    console.warn('[API] Could not fetch channels from backend:', err);
    return null;
  }
}

export async function createChannel(channelData) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(channelData),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[API] Failed creating channel:', err);
    throw err;
  }
}

export async function deleteChannel(channelId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/channels/${encodeURIComponent(channelId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[API] Failed deleting channel:`, err);
    throw err;
  }
}

export async function fetchDevices(tenantId = '', channelId = '') {
  try {
    const params = new URLSearchParams();
    if (tenantId) params.append('tenant_id', tenantId);
    if (channelId) params.append('channel_id', channelId);
    const queryString = params.toString();
    const url = queryString ? `${API_BASE_URL}/api/v1/devices?${queryString}` : `${API_BASE_URL}/api/v1/devices`;
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
      headers: getAuthHeaders(),
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
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[API] Failed resetting devices:`, err);
    throw err;
  }
}

// ----------------------------------------------------------------------------
// Guardrail Threshold Rules & Alarms APIs
// ----------------------------------------------------------------------------

export async function fetchRules(tenantId = '') {
  try {
    const url = tenantId ? `${API_BASE_URL}/api/v1/rules?tenant_id=${encodeURIComponent(tenantId)}` : `${API_BASE_URL}/api/v1/rules`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.rules || [];
  } catch (err) {
    console.warn('[API] Could not fetch rules:', err);
    return [];
  }
}

export async function createRule(ruleData) {
  const res = await fetch(`${API_BASE_URL}/api/v1/rules`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(ruleData),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP ${res.status}`);
  }
  return await res.json();
}

export async function deleteRule(ruleId) {
  const res = await fetch(`${API_BASE_URL}/api/v1/rules/${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function fetchAlarms(tenantId = '', status = '', deviceId = '') {
  try {
    const params = new URLSearchParams();
    if (tenantId) params.append('tenant_id', tenantId);
    if (status) params.append('status', status);
    if (deviceId) params.append('device_id', deviceId);
    const qs = params.toString();
    const url = qs ? `${API_BASE_URL}/api/v1/alarms?${qs}` : `${API_BASE_URL}/api/v1/alarms`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.alarms || [];
  } catch (err) {
    console.warn('[API] Could not fetch alarms:', err);
    return [];
  }
}

export async function acknowledgeAlarm(alarmId) {
  const res = await fetch(`${API_BASE_URL}/api/v1/alarms/${encodeURIComponent(alarmId)}/acknowledge`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function resolveAlarm(alarmId) {
  const res = await fetch(`${API_BASE_URL}/api/v1/alarms/${encodeURIComponent(alarmId)}/resolve`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function deleteAlarm(alarmId) {
  const res = await fetch(`${API_BASE_URL}/api/v1/alarms/${encodeURIComponent(alarmId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
