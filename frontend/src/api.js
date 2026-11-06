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

export async function deleteUser(userId) {
  const res = await fetch(`${API_BASE_URL}/api/v1/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to delete user (HTTP ${res.status})`);
  }
  return await res.json();
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

export async function fetchTenants(ownerId = '') {
  try {
    const url = ownerId 
      ? `${API_BASE_URL}/api/v1/tenants?owner_id=${encodeURIComponent(ownerId)}`
      : `${API_BASE_URL}/api/v1/tenants`;
    const res = await fetch(url, {
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
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    });
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
      headers: getAuthHeaders(),
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

export async function createDevice(deviceData) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/devices`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(deviceData),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed creating device (HTTP ${res.status})`);
    }
    return await res.json();
  } catch (err) {
    console.error('[API] Failed creating device:', err);
    throw err;
  }
}

export async function updateDevice(deviceId, updateData) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/devices/${encodeURIComponent(deviceId)}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updateData),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed updating device (HTTP ${res.status})`);
    }
    return await res.json();
  } catch (err) {
    console.error('[API] Failed updating device:', err);
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
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    });
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

export async function fetchTelemetryHistory(deviceId, limit = 50, order = 'ASC', resolution = 'raw') {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/v1/devices/${encodeURIComponent(deviceId)}/telemetry/history?limit=${limit}&order=${order}&resolution=${encodeURIComponent(resolution)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.history || [];
  } catch (err) {
    console.warn(`[API] Failed fetching telemetry history for ${deviceId}:`, err);
    return [];
  }
}

// ----------------------------------------------------------------------------
// Data Export & Reporting APIs (CSV & JSON)
// ----------------------------------------------------------------------------

export async function exportTelemetry(deviceId, format = 'csv') {
  try {
    const token = sessionStorage.getItem('iot_jwt_token') || localStorage.getItem('iot_jwt_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/api/v1/devices/${encodeURIComponent(deviceId)}/telemetry/export?format=${format}&limit=5000`, {
      headers,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `telemetry_${deviceId}_${Date.now()}.${format}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
  } catch (err) {
    console.error(`[API] Failed exporting telemetry for ${deviceId}:`, err);
    throw err;
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

// ----------------------------------------------------------------------------
// Downlink Device Control & Actuation APIs (Two-Way Communication)
// ----------------------------------------------------------------------------

export async function sendDeviceCommand(deviceId, commandData) {
  const res = await fetch(`${API_BASE_URL}/api/v1/devices/${encodeURIComponent(deviceId)}/commands`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(commandData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to dispatch command (HTTP ${res.status})`);
  }
  return await res.json();
}

export async function fetchDeviceCommands(deviceId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/devices/${encodeURIComponent(deviceId)}/commands`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.commands || [];
  } catch (err) {
    console.warn(`[API] Failed fetching commands for ${deviceId}:`, err);
    return [];
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

// ----------------------------------------------------------------------------
// Alarm Notification Dispatcher APIs (Slack, Discord, Webhooks)
// ----------------------------------------------------------------------------

export async function fetchNotificationChannels(tenantId = '') {
  try {
    const url = tenantId 
      ? `${API_BASE_URL}/api/v1/notifications/channels?tenant_id=${encodeURIComponent(tenantId)}`
      : `${API_BASE_URL}/api/v1/notifications/channels`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.channels || [];
  } catch (err) {
    console.warn('[API] Failed fetching notification channels:', err);
    return [];
  }
}

export async function createNotificationChannel(channelData) {
  const res = await fetch(`${API_BASE_URL}/api/v1/notifications/channels`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(channelData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return await res.json();
}

export async function deleteNotificationChannel(channelId) {
  const res = await fetch(`${API_BASE_URL}/api/v1/notifications/channels/${encodeURIComponent(channelId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function testNotificationChannel(targetUrl, type = 'webhook') {
  const res = await fetch(`${API_BASE_URL}/api/v1/notifications/test`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ target_url: targetUrl, type }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return await res.json();
}

// ----------------------------------------------------------------------------
// Device Provisioning & Over-the-Air (OTA) Updates
// ----------------------------------------------------------------------------

export async function regenerateDeviceToken(deviceId) {
  const res = await fetch(`${API_BASE_URL}/api/v1/devices/${encodeURIComponent(deviceId)}/token`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to rotate device token (HTTP ${res.status})`);
  }
  return await res.json();
}

export async function triggerDeviceOTA(deviceId, otaData) {
  const res = await fetch(`${API_BASE_URL}/api/v1/devices/${encodeURIComponent(deviceId)}/ota`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(otaData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to trigger OTA update (HTTP ${res.status})`);
  }
  return await res.json();
}

export async function uploadFirmware(formData) {
  const token = sessionStorage.getItem('iot_jwt_token') || localStorage.getItem('iot_jwt_token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}/api/v1/ota/firmware`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to upload firmware binary (HTTP ${res.status})`);
  }
  return await res.json();
}

export async function fetchFirmwares() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/ota/firmware`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.firmwares || [];
  } catch (err) {
    console.warn('[API] Could not fetch firmwares:', err);
    return [];
  }
}
