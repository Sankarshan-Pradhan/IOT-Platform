import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import DeviceSelector from './DeviceSelector';
import { TemperatureCard, HumidityCard, SignalHealthCard } from './MetricCard';
import TelemetryChart from './TelemetryChart';
import RecentTable from './RecentTable';
import TenantsView from './TenantsView';
import ChannelsView from './ChannelsView';
import DevicesView from './DevicesView';
import AddDeviceModal from './AddDeviceModal';
import AddTenantModal from './AddTenantModal';
import AddChannelModal from './AddChannelModal';
import GuardrailsModal from './GuardrailsModal';
import DeviceControlPanel from './DeviceControlPanel';
import MetricGauges from './MetricGauges';
import RedisCacheWidget from './RedisCacheWidget';
import { OnboardingBanner, EmptyDashboardState } from './OnboardingGuide';
import { 
  fetchHealth, 
  fetchTenants, 
  createTenant, 
  deleteTenant, 
  fetchChannels, 
  createChannel, 
  deleteChannel, 
  createDevice,
  updateDevice,
  fetchDevices, 
  fetchLatestTelemetry, 
  fetchTelemetryHistory, 
  deleteDevice, 
  resetAllDevices, 
  fetchRules, 
  createRule, 
  deleteRule, 
  fetchAlarms, 
  acknowledgeAlarm, 
  resolveAlarm, 
  deleteAlarm,
  fetchTelemetryStats,
  triggerTelemetryPrune
} from '../api';
import { Sparkles, AlertCircle, Menu, Plus, Trash2, ArrowLeft, LayoutGrid, Gauge } from 'lucide-react';

export default function UserDashboard({ currentUser, onLogout, adminUser, onBackToAdmin }) {
  // Navigation tabs: 'tenants' (Workspaces) | 'dashboard' (Live Dashboard) | 'devices' (Clients) | 'channels' (Groups)
  const [activeTab, setActiveTab] = useState('tenants');
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [metricViewMode, setMetricViewMode] = useState(() => {
    return localStorage.getItem('iot_metric_view_mode') || 'cards';
  });

  const handleSetMetricViewMode = (mode) => {
    setMetricViewMode(mode);
    try {
      localStorage.setItem('iot_metric_view_mode', mode);
    } catch (_) {}
  };

  // First-time user onboarding banner
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return localStorage.getItem('iot_hide_onboarding') !== 'true';
  });

  // User's workspaces
  const [tenants, setTenants] = useState([]);
  const [activeTenant, setActiveTenant] = useState(null);

  const hasWorkspace = Boolean(activeTenant || (Array.isArray(tenants) && tenants.length > 0));

  // Lock to workspace setup tab if user has no workspace yet
  useEffect(() => {
    if (!hasWorkspace && !adminUser && activeTab !== 'tenants') {
      setActiveTab('tenants');
    }
  }, [hasWorkspace, adminUser, activeTab]);

  // User's channels & devices
  const [channels, setChannels] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [viewMode, setViewMode] = useState('single');

  // Modals state
  const [isAddDeviceModalOpen, setIsAddDeviceModalOpen] = useState(false);
  const [targetChannelId, setTargetChannelId] = useState('');
  const [addDeviceInitialMode, setAddDeviceInitialMode] = useState('existing');
  const [isAddTenantModalOpen, setIsAddTenantModalOpen] = useState(false);
  const [isAddChannelModalOpen, setIsAddChannelModalOpen] = useState(false);
  const [isGuardrailsOpen, setIsGuardrailsOpen] = useState(false);

  // Guardrails & Alarms
  const [alarms, setAlarms] = useState([]);
  const [rules, setRules] = useState([]);

  // Telemetry state
  const [health, setHealth] = useState(null);
  const [latestDataMap, setLatestDataMap] = useState({});
  const [historyData, setHistoryData] = useState([]);
  const [secondDeviceHistory, setSecondDeviceHistory] = useState([]);

  // Telemetry statistics
  const [prevTemp, setPrevTemp] = useState(null);
  const [prevHum, setPrevHum] = useState(null);

  // UI preferences
  const [tempUnit, setTempUnit] = useState('C');
  const [limit, setLimit] = useState(50);
  const [resolution, setResolution] = useState('raw');
  const [isPolling, setIsPolling] = useState(true);
  const [countdown, setCountdown] = useState(5);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastPolledAt, setLastPolledAt] = useState(null);
  const [isSSEConnected, setIsSSEConnected] = useState(false);
  const [telemetryStats, setTelemetryStats] = useState(null);
  const [isPruning, setIsPruning] = useState(false);
  const [fcmPushAlert, setFcmPushAlert] = useState(null);

  const handlePruneTelemetry = async () => {
    setIsPruning(true);
    try {
      await triggerTelemetryPrune(10000);
      const s = await fetchTelemetryStats();
      if (s) setTelemetryStats(s);
    } catch (err) {
      console.warn('[Prune] Failed to prune telemetry:', err);
    } finally {
      setIsPruning(false);
    }
  };

  const selectedDeviceRef = useRef(selectedDeviceId);
  selectedDeviceRef.current = selectedDeviceId;

  const secondDeviceId = devices.find((d) => d.device_id !== selectedDeviceId)?.device_id || '';
  const secondDeviceRef = useRef(secondDeviceId);
  secondDeviceRef.current = secondDeviceId;

  // Real-Time Server-Sent Events (SSE) Stream Subscriber
  useEffect(() => {
    const token = sessionStorage.getItem('iot_jwt_token') || localStorage.getItem('iot_jwt_token');
    const sseUrl = `${import.meta.env.VITE_API_URL || ''}/api/v1/telemetry/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    let eventSource = null;

    try {
      eventSource = new EventSource(sseUrl);

      eventSource.addEventListener('connected', () => {
        setIsSSEConnected(true);
      });

      eventSource.addEventListener('telemetry', (e) => {
        try {
          const lt = JSON.parse(e.data);
          if (!lt || !lt.device_id) return;

          setLatestDataMap((prev) => {
            const oldReading = prev[lt.device_id]?.payload;
            const newReading = lt.payload;
            if (oldReading && newReading && lt.device_id === selectedDeviceRef.current) {
              setPrevTemp(oldReading.temperature_c ?? oldReading.temperature);
              setPrevHum(oldReading.humidity_pct ?? oldReading.humidity);
            }
            return { ...prev, [lt.device_id]: lt };
          });

          if (lt.device_id === selectedDeviceRef.current) {
            const newRecord = {
              time: lt.time || new Date().toISOString(),
              tenant_id: lt.tenant_id,
              device_id: lt.device_id,
              payload: lt.payload,
            };
            setHistoryData((prev) => {
              const updated = [...prev, newRecord];
              return updated.length > limit ? updated.slice(updated.length - limit) : updated;
            });
          }

          if (secondDeviceRef.current && lt.device_id === secondDeviceRef.current) {
            const newRecord = {
              time: lt.time || new Date().toISOString(),
              tenant_id: lt.tenant_id,
              device_id: lt.device_id,
              payload: lt.payload,
            };
            setSecondDeviceHistory((prev) => {
              const updated = [...prev, newRecord];
              return updated.length > limit ? updated.slice(updated.length - limit) : updated;
            });
          }

          setLastPolledAt(new Date());
        } catch (err) {
          console.warn('[SSE] Error processing telemetry event:', err);
        }
      });

      eventSource.addEventListener('alarm', (e) => {
        try {
          const alarm = JSON.parse(e.data);
          if (!alarm || !alarm.id) return;

          setAlarms((prev) => {
            const exists = prev.some((a) => a.id === alarm.id);
            if (exists) {
              return prev.map((a) => (a.id === alarm.id ? alarm : a));
            }
            return [alarm, ...prev];
          });
        } catch (err) {
          console.warn('[SSE] Error processing alarm event:', err);
        }
      });

      eventSource.addEventListener('device_status', (e) => {
        try {
          const statusEvent = JSON.parse(e.data);
          if (!statusEvent || !statusEvent.device_id) return;
          setDevices((prev) =>
            prev.map((d) =>
              d.device_id === statusEvent.device_id || d.id === statusEvent.device_id
                ? { ...d, status: statusEvent.status, updated_at: statusEvent.updated_at }
                : d
            )
          );
        } catch (err) {
          console.warn('[SSE] Error processing device_status event:', err);
        }
      });

      // Real-time FCM Mobile Push Alert Listener
      eventSource.addEventListener('fcm_push', (e) => {
        try {
          const pushPayload = JSON.parse(e.data);
          setFcmPushAlert(pushPayload);
          setTimeout(() => setFcmPushAlert(null), 8000);
        } catch (err) {
          console.warn('[SSE] Error processing fcm_push event:', err);
        }
      });

      eventSource.onerror = () => {
        setIsSSEConnected(false);
      };
    } catch (e) {
      setIsSSEConnected(false);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [limit]);

  // Load User Data
  const loadUserData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // 1. Healthcheck & Telemetry Storage Stats
      const [h, stats] = await Promise.all([fetchHealth(), fetchTelemetryStats()]);
      setHealth(h);
      if (stats) setTelemetryStats(stats);

      // 2. Fetch User's Workspaces (User-Scoped)
      const allTenants = await fetchTenants(currentUser?.id || currentUser?.username || '');
      let userTenants = allTenants || [];
      if (Array.isArray(allTenants) && currentUser) {
        if (currentUser.role !== 'admin') {
          userTenants = allTenants.filter((t) => 
            t.owner_id === currentUser.id || 
            t.owner_id === currentUser.username || 
            (currentUser.email && t.owner_email === currentUser.email)
          );
        }
      }

      if (Array.isArray(userTenants) && userTenants.length > 0) {
        setTenants(userTenants);
        setActiveTenant((curr) => {
          if (curr) {
            const found = userTenants.find((t) => t.id === curr.id);
            if (found) return found;
          }
          return userTenants[0];
        });
      } else {
        setTenants([]);
        setActiveTenant(null);
        setChannels([]);
        setDevices([]);
        setAlarms([]);
        setRules([]);
        setSelectedDeviceId('');
        setHistoryData([]);
        setLatestDataMap({});
      }

      // 3. Fetch Channels for active workspace
      const currentTId = activeTenant?.id || (userTenants && userTenants[0]?.id) || '';
      if (currentTId) {
        const backendChannels = await fetchChannels(currentTId);
        if (Array.isArray(backendChannels)) {
          setChannels(backendChannels);
        }

        // 4. Fetch Alarms & Rules
        const [backendAlarms, backendRules] = await Promise.all([
          fetchAlarms(currentTId),
          fetchRules(currentTId),
        ]);
        if (Array.isArray(backendAlarms)) setAlarms(backendAlarms);
        if (Array.isArray(backendRules)) setRules(backendRules);

        // 5. Fetch Devices for active workspace
        const devList = await fetchDevices(currentTId);
        if (Array.isArray(devList)) {
          setDevices(devList);
          if (devList.length > 0) {
            if (!selectedDeviceRef.current || !devList.some((d) => d.device_id === selectedDeviceRef.current)) {
              setSelectedDeviceId(devList[0].device_id);
            }
          } else {
            setSelectedDeviceId('');
            setHistoryData([]);
            setLatestDataMap({});
          }
        }
      }

      // 6. Fetch Telemetry for Selected Device & Compare Device
      const devId = selectedDeviceRef.current || (Array.isArray(devList) && devList[0]?.device_id);
      const compareDev = Array.isArray(devList) ? devList.find((d) => d.device_id !== devId) : null;
      const compareDevId = compareDev?.device_id || '';

      if (devId) {
        const fetchPromises = [
          fetchLatestTelemetry(devId),
          fetchTelemetryHistory(devId, limit, 'ASC', resolution),
        ];
        if (compareDevId) {
          fetchPromises.push(fetchTelemetryHistory(compareDevId, limit, 'ASC', resolution));
        }

        const [latest, hist, hist2] = await Promise.all(fetchPromises);

        if (latest) {
          setLatestDataMap((prev) => {
            const oldReading = prev[devId]?.payload;
            const newReading = latest?.payload;
            if (oldReading && newReading) {
              setPrevTemp(oldReading.temperature_c ?? oldReading.temperature);
              setPrevHum(oldReading.humidity_pct ?? oldReading.humidity);
            }
            return { ...prev, [devId]: latest };
          });
        }
        if (Array.isArray(hist)) {
          setHistoryData(hist);
        }
        if (Array.isArray(hist2)) {
          setSecondDeviceHistory(hist2);
        } else if (!compareDevId) {
          setSecondDeviceHistory([]);
        }
      }

      setLastPolledAt(new Date());
    } catch (err) {
      console.warn('[UserDashboard] Error polling data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [activeTenant?.id, limit, resolution]);

  // Initial load
  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // 5-second countdown ticker
  useEffect(() => {
    if (!isPolling) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadUserData();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPolling, loadUserData]);

  // Workspace Actions
  const handleAddTenant = async (tenantData) => {
    try {
      const payload = {
        ...tenantData,
        owner_id: currentUser?.id,
        owner_name: currentUser?.name || currentUser?.username,
        owner_email: currentUser?.email,
      };
      const created = await createTenant(payload);
      setTenants((prev) => [...prev, created]);
      setActiveTenant(created);
      setIsAddTenantModalOpen(false);
      await loadUserData();
    } catch (err) {
      alert(`Could not create workspace: ${err.message}`);
    }
  };

  const handleDeleteTenant = async (tenantId) => {
    try {
      await deleteTenant(tenantId);
      const remaining = tenants.filter((t) => t.id !== tenantId);
      setTenants(remaining);
      if (activeTenant?.id === tenantId) {
        setActiveTenant(remaining[0] || null);
      }
      await loadUserData();
    } catch (err) {
      alert(`Could not delete workspace: ${err.message}`);
    }
  };

  // Channel Actions
  const handleAddChannel = async (channelData) => {
    try {
      const created = await createChannel({
        ...channelData,
        tenant_id: activeTenant?.id,
      });
      setChannels((prev) => [...prev, created]);
      setIsAddChannelModalOpen(false);
      await loadUserData();
    } catch (err) {
      alert(`Could not add channel: ${err.message}`);
    }
  };

  const handleDeleteChannel = async (channelId) => {
    try {
      await deleteChannel(channelId);
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
    } catch (err) {
      alert(`Could not delete channel: ${err.message}`);
    }
  };

  // Device Actions
  const handleDeviceRegistered = async (newDevice) => {
    try {
      const created = await createDevice({
        ...newDevice,
        tenant_id: activeTenant?.id || newDevice.tenant_id,
      });
      setDevices((prev) => [...prev.filter((d) => d.device_id !== created.device_id), created]);
      setSelectedDeviceId(created.device_id);
      setIsAddDeviceModalOpen(false);
      setTargetChannelId('');
      await loadUserData();
    } catch (err) {
      alert(`Could not register device: ${err.message}`);
    }
  };

  const handleOpenAddDevice = (channelId = '', mode = 'existing') => {
    setTargetChannelId(channelId);
    setAddDeviceInitialMode(mode);
    setIsAddDeviceModalOpen(true);
  };

  const handleDeviceAssigned = async (deviceId, channelId) => {
    try {
      await updateDevice(deviceId, { channel_id: channelId });
      setIsAddDeviceModalOpen(false);
      setTargetChannelId('');
      await loadUserData();
    } catch (err) {
      alert(`Could not link device to channel: ${err.message}`);
    }
  };

  const handleUnlinkDevice = async (deviceId) => {
    try {
      await updateDevice(deviceId, { channel_id: '' });
      await loadUserData();
    } catch (err) {
      alert(`Could not unlink device: ${err.message}`);
    }
  };

  const handleDeleteDevice = async (deviceId) => {
    try {
      await deleteDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.device_id !== deviceId));
      if (selectedDeviceId === deviceId) {
        const remaining = devices.filter((d) => d.device_id !== deviceId);
        setSelectedDeviceId(remaining[0]?.device_id || '');
      }
      await loadUserData();
    } catch (err) {
      alert(`Could not delete device: ${err.message}`);
    }
  };

  const handleResetAllDevices = async () => {
    try {
      await resetAllDevices();
      setDevices([]);
      setSelectedDeviceId('');
      setHistoryData([]);
      setLatestDataMap({});
      await loadUserData();
    } catch (err) {
      alert(`Could not clear devices: ${err.message}`);
    }
  };

  // Alarms & Rules
  const handleAcknowledgeAlarm = async (alarmId) => {
    try {
      await acknowledgeAlarm(alarmId);
      setAlarms((prev) => prev.map((a) => (a.id === alarmId ? { ...a, status: 'ACKNOWLEDGED' } : a)));
    } catch (err) {
      alert(`Could not acknowledge alarm: ${err.message}`);
    }
  };

  const handleResolveAlarm = async (alarmId) => {
    try {
      await resolveAlarm(alarmId);
      setAlarms((prev) => prev.map((a) => (a.id === alarmId ? { ...a, status: 'RESOLVED' } : a)));
    } catch (err) {
      alert(`Could not resolve alarm: ${err.message}`);
    }
  };

  const handleDeleteAlarm = async (alarmId) => {
    try {
      await deleteAlarm(alarmId);
      setAlarms((prev) => prev.filter((a) => a.id !== alarmId));
    } catch (err) {
      alert(`Could not delete alarm: ${err.message}`);
    }
  };

  const handleCreateRule = async (ruleData) => {
    try {
      const created = await createRule(ruleData);
      setRules((prev) => [...prev, created]);
      await loadUserData();
    } catch (err) {
      alert(`Could not create rule: ${err.message}`);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      await deleteRule(ruleId);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (err) {
      alert(`Could not delete rule: ${err.message}`);
    }
  };

  // Metrics computation
  const currentLatest = selectedDeviceId ? latestDataMap[selectedDeviceId] : null;
  const payload = currentLatest?.payload || {};
  const currentTemp = payload.temperature_c ?? payload.temperature ?? null;
  const currentHum = payload.humidity_pct ?? payload.humidity ?? null;

  const validTemps = historyData
    .map((d) => d?.payload?.temperature_c ?? d?.payload?.temperature)
    .filter((t) => t !== undefined && t !== null && !isNaN(t));
  const validHums = historyData
    .map((d) => d?.payload?.humidity_pct ?? d?.payload?.humidity)
    .filter((h) => h !== undefined && h !== null && !isNaN(h));

  const minTemp = validTemps.length > 0 ? Math.min(...validTemps) : null;
  const maxTemp = validTemps.length > 0 ? Math.max(...validTemps) : null;
  const minHum = validHums.length > 0 ? Math.min(...validHums) : null;
  const maxHum = validHums.length > 0 ? Math.max(...validHums) : null;

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900 antialiased selection:bg-emerald-500/20 selection:text-emerald-700">
      
      {/* 1. Left Sidebar Navigation for User */}
      <div className={`fixed inset-y-0 left-0 z-50 transform md:relative md:translate-x-0 transition-transform duration-200 ease-in-out ${
        isSidebarOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            setIsSidebarOpenMobile(false);
          }}
          tenants={tenants}
          activeTenant={activeTenant}
          setActiveTenant={setActiveTenant}
          channels={channels}
          devices={devices}
          onOpenAddTenant={() => setIsAddTenantModalOpen(true)}
          onOpenAddDevice={() => setIsAddDeviceModalOpen(true)}
          isAdmin={false}
          openAlarmsCount={alarms.filter((a) => a.status === 'OPEN').length}
          onOpenGuardrailsModal={() => setIsGuardrailsOpen(true)}
          onBackToAdmin={onBackToAdmin}
        />
      </div>

      {/* Backdrop for mobile */}
      {isSidebarOpenMobile && (
        <div
          onClick={() => setIsSidebarOpenMobile(false)}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm md:hidden"
        />
      )}

      {/* 2. Main User Dashboard Layout */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">

        {/* Administrator Impersonation / View-As Mode Banner */}
        {adminUser && (
          <div className="bg-amber-400 text-slate-950 px-4 py-2.5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs border-b border-amber-500 sticky top-0 z-50">
            <div className="flex items-center gap-2">
              <span className="font-extrabold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full bg-slate-950 text-amber-300 shadow-xs">
                ADMIN ACCESS
              </span>
              <span className="text-xs font-semibold">
                Viewing operator dashboard for <strong className="font-bold underline">{currentUser?.name || currentUser?.username}</strong> (@{currentUser?.username})
              </span>
            </div>
            <button
              type="button"
              onClick={onBackToAdmin}
              className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-900 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              title="Return to Administrator Console"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>← Return to Admin Console</span>
            </button>
          </div>
        )}
        
        {/* Top Header */}
        <div className="flex items-center">
          <button
            onClick={() => setIsSidebarOpenMobile(!isSidebarOpenMobile)}
            className="p-3 text-slate-500 hover:text-slate-900 md:hidden border-b border-slate-200 bg-white"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="flex-1">
            <Header
              health={health}
              isPolling={isPolling}
              setIsPolling={setIsPolling}
              countdown={countdown}
              onManualRefresh={() => {
                loadUserData();
                setCountdown(5);
              }}
              isRefreshing={isRefreshing}
              tempUnit={tempUnit}
              setTempUnit={setTempUnit}
              lastPolledAt={lastPolledAt}
              activeTenant={activeTenant}
              openAlarmsCount={alarms.filter((a) => a.status === 'OPEN').length}
              onOpenGuardrailsModal={() => setIsGuardrailsOpen(true)}
              currentUser={currentUser}
              onLogout={onLogout}
              isSSEConnected={isSSEConnected}
              telemetryStats={telemetryStats}
              onPruneTelemetry={handlePruneTelemetry}
              isPruning={isPruning}
            />
          </div>
        </div>

        {/* Dynamic View Content based on activeTab */}
        <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
          
          {/* Live Mobile Push Notification Toast Banner (FCM Stream) */}
          {fcmPushAlert && (
            <div className="rounded-2xl bg-amber-500 text-slate-950 p-3 sm:p-4 shadow-lg flex items-center justify-between gap-3 animate-bounce">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-slate-950 text-amber-400 font-bold text-xs uppercase tracking-wider shrink-0">
                  📱 Mobile Push Alert
                </span>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm">{fcmPushAlert.title}</h4>
                  <p className="text-xs text-slate-900 font-medium">{fcmPushAlert.body}</p>
                </div>
              </div>
              <button
                onClick={() => setFcmPushAlert(null)}
                className="px-2.5 py-1 rounded-lg bg-slate-950/20 hover:bg-slate-950/30 text-slate-950 text-xs font-bold transition cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>
          )}

          {/* Offline Banner if Backend is down */}
          {health && health.status !== 'ok' && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3 text-amber-800 text-xs sm:text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900">Backend service not detected on localhost:8080</p>
                <p className="text-amber-800/80 mt-1">
                  Start your backend with <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">go run backend/main.go</code>.
                </p>
              </div>
            </div>
          )}

          {/* SECTION 1: WORKSPACES */}
          {activeTab === 'tenants' && (
            <TenantsView
              tenants={tenants}
              activeTenant={activeTenant}
              setActiveTenant={setActiveTenant}
              onOpenAddTenant={() => setIsAddTenantModalOpen(true)}
              onOpenAddDevice={() => handleOpenAddDevice('', 'new')}
              onDeleteTenant={handleDeleteTenant}
              onAddTenant={handleAddTenant}
              currentUser={currentUser}
            />
          )}

          {/* SECTION 2: LIVE DASHBOARD */}
          {activeTab === 'dashboard' && (
            <>
              {/* Onboarding Guide Banner */}
              <OnboardingBanner
                isVisible={showOnboarding}
                onClose={() => {
                  setShowOnboarding(false);
                  localStorage.setItem('iot_hide_onboarding', 'true');
                }}
                onAddDevice={() => setIsAddDeviceModalOpen(true)}
              />

              {/* Device Selector */}
              <DeviceSelector
                devices={devices}
                channels={channels}
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={(id) => {
                  setSelectedDeviceId(id);
                  setCountdown(5);
                }}
                latestDataMap={latestDataMap}
                viewMode={viewMode}
                setViewMode={setViewMode}
                onOpenAddDevice={() => handleOpenAddDevice('', 'new')}
                onDeleteDevice={handleDeleteDevice}
                isAdmin={false}
              />

              {/* Redis L1 In-Memory Cache Engine Status & Controls */}
              <RedisCacheWidget />

              {/* Only show live metric cards and charts if there is a selected device with data */}
              {devices.length > 0 ? (
                <>
                  {/* Metric Display Mode Switcher (Standard Digital Cards vs. Industrial Speedometer Gauges) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Live Telemetry Monitor
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        • {selectedDeviceId}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium self-start sm:self-auto">
                      <button
                        onClick={() => handleSetMetricViewMode('cards')}
                        className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer ${
                          metricViewMode === 'cards'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                        }`}
                        title="Display metrics as standard digital number cards"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>Digital Cards</span>
                      </button>
                      <button
                        onClick={() => handleSetMetricViewMode('gauges')}
                        className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer ${
                          metricViewMode === 'gauges'
                            ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                        }`}
                        title="Display metrics as industrial radial speedometer gauges"
                      >
                        <Gauge className="w-3.5 h-3.5" />
                        <span>Radial Gauges</span>
                      </button>
                    </div>
                  </div>

                  {/* Render Cards or Gauges based on selected mode */}
                  {metricViewMode === 'cards' ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
                      <TemperatureCard
                        valueC={currentTemp}
                        tempUnit={tempUnit}
                        minVal={minTemp}
                        maxVal={maxTemp}
                        prevVal={prevTemp}
                        deviceId={selectedDeviceId}
                      />

                      <HumidityCard
                        valuePct={currentHum}
                        minVal={minHum}
                        maxVal={maxHum}
                        prevVal={prevHum}
                        deviceId={selectedDeviceId}
                      />

                      <SignalHealthCard
                        payload={payload}
                        deviceId={selectedDeviceId}
                        lastSeenTime={currentLatest?.time}
                      />
                    </div>
                  ) : (
                    <MetricGauges
                      currentTemp={currentTemp}
                      tempUnit={tempUnit}
                      minTemp={minTemp}
                      maxTemp={maxTemp}
                      prevTemp={prevTemp}
                      currentHum={currentHum}
                      minHum={minHum}
                      maxHum={maxHum}
                      prevHum={prevHum}
                      payload={payload}
                      deviceId={selectedDeviceId}
                    />
                  )}

                  {/* Historical Line Chart */}
                  <TelemetryChart
                    historyData={historyData}
                    deviceId={selectedDeviceId}
                    tempUnit={tempUnit}
                    limit={limit}
                    setLimit={setLimit}
                    resolution={resolution}
                    setResolution={setResolution}
                    isCompareMode={viewMode === 'compare' && Boolean(secondDeviceId)}
                    secondDeviceHistory={secondDeviceHistory}
                    secondDeviceId={secondDeviceId}
                  />

                  {/* Recent Ingestion Table */}
                  <RecentTable historyData={historyData} tempUnit={tempUnit} />

                  {/* Two-Way Downlink Device Control & Actuation */}
                  <DeviceControlPanel
                    deviceId={selectedDeviceId}
                    activeDeviceName={devices.find((d) => d.device_id === selectedDeviceId)?.name}
                    authToken={devices.find((d) => d.device_id === selectedDeviceId)?.auth_token}
                  />
                </>
              ) : (
                <EmptyDashboardState onAddDevice={() => setIsAddDeviceModalOpen(true)} isAdmin={false} />
              )}

              {/* Bottom Workspace Action Bar */}
              <div className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  <span>Real-time continuous 5-second polling active across your workspace.</span>
                </div>

                <div className="flex items-center gap-2">
                  {devices.length > 0 && (
                    <button
                      onClick={() => {
                        if (window.confirm('Clear all devices and telemetry from this workspace?')) {
                          handleResetAllDevices();
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1.5 transition font-semibold"
                      title="Clear all devices"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear All Devices</span>
                    </button>
                  )}
                  <button
                    onClick={() => setIsAddDeviceModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-1.5 transition shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Register New Device</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* SECTION 3: CLIENTS & DEVICES */}
          {activeTab === 'devices' && (
            <DevicesView
              devices={devices}
              channels={channels}
              latestDataMap={latestDataMap}
              onOpenAddDevice={() => handleOpenAddDevice('', 'new')}
              onSelectDevice={(id) => setSelectedDeviceId(id)}
              onNavigateToDashboard={() => setActiveTab('dashboard')}
              onDeleteDevice={handleDeleteDevice}
              onResetAllDevices={handleResetAllDevices}
              isAdmin={false}
            />
          )}

          {/* SECTION 4: GROUPS & CHANNELS */}
          {activeTab === 'channels' && (
            <ChannelsView
              channels={channels}
              devices={devices}
              onOpenAddChannel={() => setIsAddChannelModalOpen(true)}
              onOpenAddDevice={(chanId) => handleOpenAddDevice(chanId, 'existing')}
              onUnlinkDevice={handleUnlinkDevice}
              onDeleteChannel={handleDeleteChannel}
              onSelectDevice={(id) => setSelectedDeviceId(id)}
              onNavigateToDashboard={() => setActiveTab('dashboard')}
              isAdmin={false}
            />
          )}

        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500 bg-white">
          <p>IoT Platform • Enterprise Telemetry Dashboard • TimescaleDB + Mosquitto + ESP32</p>
        </footer>

      </div>

      {/* MODALS */}
      <AddDeviceModal
        isOpen={isAddDeviceModalOpen}
        onClose={() => {
          setIsAddDeviceModalOpen(false);
          setTargetChannelId('');
        }}
        activeTenantId={activeTenant?.id}
        channels={channels}
        devices={devices}
        initialChannelId={targetChannelId}
        initialMode={addDeviceInitialMode}
        onDeviceRegistered={handleDeviceRegistered}
        onDeviceAssigned={handleDeviceAssigned}
      />

      <AddTenantModal
        isOpen={isAddTenantModalOpen}
        onClose={() => setIsAddTenantModalOpen(false)}
        onAddTenant={handleAddTenant}
      />

      <AddChannelModal
        isOpen={isAddChannelModalOpen}
        onClose={() => setIsAddChannelModalOpen(false)}
        onAddChannel={handleAddChannel}
        activeTenantId={activeTenant?.id}
      />

      <GuardrailsModal
        isOpen={isGuardrailsOpen}
        onClose={() => setIsGuardrailsOpen(false)}
        alarms={alarms}
        rules={rules}
        onAcknowledgeAlarm={handleAcknowledgeAlarm}
        onResolveAlarm={handleResolveAlarm}
        onDeleteAlarm={handleDeleteAlarm}
        onCreateRule={handleCreateRule}
        onDeleteRule={handleDeleteRule}
        activeTenantId={activeTenant?.id}
        isAdmin={false}
      />

    </div>
  );
}
