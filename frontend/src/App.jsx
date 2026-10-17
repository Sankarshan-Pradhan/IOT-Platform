import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DeviceSelector from './components/DeviceSelector';
import { TemperatureCard, HumidityCard, SignalHealthCard } from './components/MetricCard';
import TelemetryChart from './components/TelemetryChart';
import RecentTable from './components/RecentTable';
import TenantsView from './components/TenantsView';
import ChannelsView from './components/ChannelsView';
import DevicesView from './components/DevicesView';
import ProvisioningView from './components/ProvisioningView';
import ProvisionModal from './components/ProvisionModal';
import AddTenantModal from './components/AddTenantModal';
import AddChannelModal from './components/AddChannelModal';
import { 
  fetchHealth, 
  fetchDevices, 
  fetchLatestTelemetry, 
  fetchTelemetryHistory,
  sendTelemetryHTTP,
  deleteDevice,
  resetAllDevices
} from './api';
import { Send, Sparkles, AlertCircle, Menu, Key, Trash2 } from 'lucide-react';

const INITIAL_TENANTS = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Default Organization',
    slug: 'default-org',
    description: 'Default multi-tenant workspace with TimescaleDB hypertable isolation.',
  },
  {
    id: 'b1111111-1111-1111-1111-111111111112',
    name: 'Advanced Robotics Lab',
    slug: 'robotics-lab',
    description: 'High-precision environmental sensors for hardware testing bays.',
  },
];

const INITIAL_CHANNELS = [
  {
    id: 'chan-dht22-alpha',
    name: 'Laboratory Environmental Sensors',
    group: 'Environmental Monitoring',
    topic: 'devices/+/telemetry',
    description: 'DHT22 sensors streaming temperature and humidity every 5s.',
    devices_count: 0,
  },
  {
    id: 'chan-hvac-zone1',
    name: 'Server Room HVAC Control',
    group: 'Server Room HVAC',
    topic: 'channels/chan-hvac-zone1/telemetry',
    description: 'Critical cooling and humidity threshold telemetry.',
    devices_count: 0,
  },
];

export default function App() {
  // Navigation tabs: 'dashboard', 'tenants', 'channels', 'devices', 'provisioning'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);

  // Theme state: 'light' or 'dark' (Default to clean light mode with option to toggle)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('iot_theme') || 'light';
  });

  // Apply theme to document element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('iot_theme', theme);
  }, [theme]);

  // Multi-tenant & Channels state (saved to localStorage for persistence)
  const [tenants, setTenants] = useState(() => {
    const saved = localStorage.getItem('iot_tenants');
    return saved ? JSON.parse(saved) : INITIAL_TENANTS;
  });
  const [activeTenant, setActiveTenant] = useState(tenants[0] || INITIAL_TENANTS[0]);

  const [channels, setChannels] = useState(() => {
    const saved = localStorage.getItem('iot_channels');
    return saved ? JSON.parse(saved) : INITIAL_CHANNELS;
  });

  // Filter out any known temporary / seed test devices
  const isDemoDevice = (id) => id === 'esp32-dht22-01' || id === 'esp32-demo-01';

  // Devices state: initialized dynamically per tenant (starts clean, zero fake devices)
  const [devices, setDevices] = useState(() => {
    const saved = localStorage.getItem(`iot_devices_${activeTenant?.id}`);
    const parsed = saved ? JSON.parse(saved) : [];
    return parsed.filter((d) => !isDemoDevice(d.device_id));
  });

  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [viewMode, setViewMode] = useState('single');

  // Modals state
  const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false);
  const [isAddTenantModalOpen, setIsAddTenantModalOpen] = useState(false);
  const [isAddChannelModalOpen, setIsAddChannelModalOpen] = useState(false);

  // Backend & Telemetry state
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
  const [isPolling, setIsPolling] = useState(true);
  const [countdown, setCountdown] = useState(5);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastPolledAt, setLastPolledAt] = useState(null);
  const [isInjecting, setIsInjecting] = useState(false);

  const selectedDeviceRef = useRef(selectedDeviceId);
  selectedDeviceRef.current = selectedDeviceId;

  // Persist tenants & channels in localStorage
  useEffect(() => {
    localStorage.setItem('iot_tenants', JSON.stringify(tenants));
  }, [tenants]);

  useEffect(() => {
    localStorage.setItem('iot_channels', JSON.stringify(channels));
  }, [channels]);

  // Sync devices when active tenant changes
  useEffect(() => {
    const saved = localStorage.getItem(`iot_devices_${activeTenant?.id}`);
    const loaded = saved ? JSON.parse(saved) : [];
    const cleaned = loaded.filter((d) => !isDemoDevice(d.device_id));
    localStorage.setItem(`iot_devices_${activeTenant?.id}`, JSON.stringify(cleaned));
    setDevices(cleaned);
    if (cleaned.length > 0) {
      setSelectedDeviceId(cleaned[0].device_id);
    } else {
      setSelectedDeviceId('');
      setHistoryData([]);
      setLatestDataMap({});
    }
  }, [activeTenant]);

  // ----------------------------------------------------------------------------
  // Data Fetching Functions
  // ----------------------------------------------------------------------------
  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // 1. Healthcheck
      const h = await fetchHealth();
      setHealth(h);

      // 2. Fetch devices from backend for this tenant
      const devList = await fetchDevices(activeTenant?.id);
      if (Array.isArray(devList)) {
        const cleanList = devList.filter((d) => !isDemoDevice(d.device_id));
        setDevices(cleanList);
        localStorage.setItem(`iot_devices_${activeTenant?.id}`, JSON.stringify(cleanList));

        if (!selectedDeviceRef.current && cleanList.length > 0) {
          setSelectedDeviceId(cleanList[0].device_id);
        } else if (cleanList.length === 0 || !cleanList.some((d) => d.device_id === selectedDeviceRef.current)) {
          setSelectedDeviceId(cleanList.length > 0 ? cleanList[0].device_id : '');
          if (cleanList.length === 0) {
            setHistoryData([]);
            setLatestDataMap({});
          }
        }
      }

      const activeId = selectedDeviceRef.current;
      if (!activeId) {
        setIsRefreshing(false);
        return;
      }

      // 3. Fetch latest telemetry for primary device
      const latest = await fetchLatestTelemetry(activeId);
      if (latest && latest.payload) {
        setLatestDataMap((prev) => {
          const oldPayload = prev[activeId]?.payload;
          if (oldPayload?.temperature_c !== undefined) {
            setPrevTemp(oldPayload.temperature_c);
          }
          if (oldPayload?.humidity_pct !== undefined) {
            setPrevHum(oldPayload.humidity_pct);
          }
          return { ...prev, [activeId]: latest };
        });
      }

      // 4. Fetch history for primary device
      const hist = await fetchTelemetryHistory(activeId, limit, 'ASC');
      setHistoryData(hist);

      setLastPolledAt(new Date());
    } catch (err) {
      console.error('[Dashboard] Error during poll:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [limit, activeTenant]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData, selectedDeviceId, activeTenant]);

  // ----------------------------------------------------------------------------
  // 5-Second Polling Ticker
  // ----------------------------------------------------------------------------
  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadData();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPolling, loadData]);

  // ----------------------------------------------------------------------------
  // Ingest Sample Telemetry Test Trigger
  // ----------------------------------------------------------------------------
  const handleTestInject = async () => {
    const targetId = selectedDeviceId || 'esp32-node-01';
    setIsInjecting(true);
    try {
      const randomTemp = parseFloat((22 + Math.random() * 8).toFixed(1));
      const randomHum = parseFloat((45 + Math.random() * 25).toFixed(1));
      const payload = {
        device_id: targetId,
        tenant_id: activeTenant.id,
        temperature_c: randomTemp,
        humidity_pct: randomHum,
        seq: Math.floor(Math.random() * 1000),
        uptime_s: 120,
        wifi_rssi: -55 - Math.floor(Math.random() * 15),
      };

      await sendTelemetryHTTP(targetId, payload);
      
      // Auto-register device if not already present in workspace
      handleDeviceRegistered({
        device_id: targetId,
        tenant_id: activeTenant.id,
        name: `${targetId.toUpperCase()} (DHT22)`,
        device_type: 'ESP32',
        status: 'online',
      });

      await loadData();
      setCountdown(5);
    } catch (err) {
      alert(`Could not inject telemetry: ${err.message}. Is backend running on localhost:8080?`);
    } finally {
      setIsInjecting(false);
    }
  };

  const handleAddTenant = (newTenant) => {
    setTenants((prev) => [...prev, newTenant]);
    setActiveTenant(newTenant);
  };

  const handleAddChannel = (newChannel) => {
    setChannels((prev) => [...prev, newChannel]);
  };

  const handleDeviceRegistered = (newDevice) => {
    setDevices((prev) => {
      const exists = prev.some((d) => d.device_id === newDevice.device_id);
      const updated = exists
        ? prev.map((d) => (d.device_id === newDevice.device_id ? { ...d, ...newDevice } : d))
        : [...prev, newDevice];
      localStorage.setItem(`iot_devices_${activeTenant?.id}`, JSON.stringify(updated));
      return updated;
    });
    setSelectedDeviceId(newDevice.device_id);
  };

  const handleDeleteDevice = async (deviceId) => {
    try {
      await deleteDevice(deviceId);
    } catch (e) {
      console.warn('Backend delete error:', e);
    }
    setDevices((prev) => {
      const updated = prev.filter((d) => d.device_id !== deviceId);
      localStorage.setItem(`iot_devices_${activeTenant?.id}`, JSON.stringify(updated));
      return updated;
    });
    if (selectedDeviceId === deviceId) {
      setSelectedDeviceId('');
      setHistoryData([]);
      setLatestDataMap((prev) => {
        const copy = { ...prev };
        delete copy[deviceId];
        return copy;
      });
    }
  };

  const handleResetAllDevices = async () => {
    try {
      await resetAllDevices();
    } catch (e) {
      console.warn('Backend reset error:', e);
    }
    setDevices([]);
    setSelectedDeviceId('');
    setHistoryData([]);
    setLatestDataMap({});
    localStorage.removeItem(`iot_devices_${activeTenant?.id}`);
  };

  // Extract Stats for Active Device
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

  const secondDeviceId = devices.find((d) => d.device_id !== selectedDeviceId)?.device_id || '';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex text-slate-900 dark:text-slate-100 antialiased selection:bg-emerald-500/30 selection:text-emerald-700 dark:selection:text-emerald-300 transition-colors duration-200">
      
      {/* 1. Left Sidebar Navigation */}
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
          onOpenAddChannel={() => setIsAddChannelModalOpen(true)}
          onOpenProvision={() => setIsProvisionModalOpen(true)}
        />
      </div>

      {/* Backdrop for mobile */}
      {isSidebarOpenMobile && (
        <div
          onClick={() => setIsSidebarOpenMobile(false)}
          className="fixed inset-0 bg-slate-950/60 z-40 md:hidden"
        />
      )}

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto h-screen">
        
        {/* Top Header */}
        <div className="flex items-center">
          <button
            onClick={() => setIsSidebarOpenMobile(!isSidebarOpenMobile)}
            className="p-3 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
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
                loadData();
                setCountdown(5);
              }}
              isRefreshing={isRefreshing}
              tempUnit={tempUnit}
              setTempUnit={setTempUnit}
              theme={theme}
              setTheme={setTheme}
              lastPolledAt={lastPolledAt}
              activeTenant={activeTenant}
            />
          </div>
        </div>

        {/* Dynamic View Content based on activeTab */}
        <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
          
          {/* Offline Banner if Backend is down */}
          {health && health.status !== 'ok' && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-4 flex items-start gap-3 text-amber-800 dark:text-amber-300 text-xs sm:text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-200">Backend service not detected on localhost:8080</p>
                <p className="text-amber-800/80 dark:text-amber-300/80 mt-1">
                  Start your backend with <code className="bg-amber-100 dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono">go run backend/main.go</code> and ensure infrastructure is running via <code className="bg-amber-100 dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono">docker compose up -d</code> in <code className="font-mono">infra/</code>.
                </p>
              </div>
            </div>
          )}

          {/* TAB 1: LIVE DASHBOARD */}
          {activeTab === 'dashboard' && (
            <>
              {/* Device Selector */}
              <DeviceSelector
                devices={devices}
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={(id) => {
                  setSelectedDeviceId(id);
                  setCountdown(5);
                }}
                latestDataMap={latestDataMap}
                viewMode={viewMode}
                setViewMode={setViewMode}
                onOpenProvision={() => setIsProvisionModalOpen(true)}
              />

              {/* Only show live metric cards and charts if there is a selected device or active telemetry */}
              {devices.length > 0 ? (
                <>
                  {/* Live Metric Cards */}
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

                  {/* Historical Line Chart */}
                  <TelemetryChart
                    historyData={historyData}
                    deviceId={selectedDeviceId}
                    tempUnit={tempUnit}
                    limit={limit}
                    setLimit={setLimit}
                    isCompareMode={viewMode === 'compare' && Boolean(secondDeviceId)}
                    secondDeviceHistory={secondDeviceHistory}
                    secondDeviceId={secondDeviceId}
                    theme={theme}
                  />

                  {/* Recent Ingestion Table */}
                  <RecentTable historyData={historyData} tempUnit={tempUnit} />
                </>
              ) : null}

              {/* Ingestion & Provisioning Action Panel */}
              <div className="rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-sm">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  <span>Connect an ESP32 or simulate telemetry without physical hardware:</span>
                </div>

                <div className="flex items-center gap-2">
                  {devices.length > 0 && (
                    <button
                      onClick={() => {
                        if (window.confirm('Clear all devices and telemetry from this workspace?')) {
                          handleResetAllDevices();
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 flex items-center gap-1.5 transition font-semibold"
                      title="Clear all test devices"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Test Devices</span>
                    </button>
                  )}
                  <button
                    onClick={handleTestInject}
                    disabled={isInjecting}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition disabled:opacity-50 font-semibold"
                  >
                    <Send className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{isInjecting ? 'Sending...' : 'Send Test Packet'}</span>
                  </button>
                  <button
                    onClick={() => setIsProvisionModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-1.5 transition shadow-sm"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>Provision ESP32</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: TENANTS & WORKSPACES */}
          {activeTab === 'tenants' && (
            <TenantsView
              tenants={tenants}
              activeTenant={activeTenant}
              setActiveTenant={setActiveTenant}
              onOpenAddTenant={() => setIsAddTenantModalOpen(true)}
              onOpenProvision={() => setIsProvisionModalOpen(true)}
            />
          )}

          {/* TAB 3: GROUPS & CHANNELS */}
          {activeTab === 'channels' && (
            <ChannelsView
              channels={channels}
              onOpenAddChannel={() => setIsAddChannelModalOpen(true)}
              onOpenProvision={() => setIsProvisionModalOpen(true)}
            />
          )}

          {/* TAB 4: CLIENTS & DEVICES */}
          {activeTab === 'devices' && (
            <DevicesView
              devices={devices}
              latestDataMap={latestDataMap}
              onOpenProvision={() => setIsProvisionModalOpen(true)}
              onSelectDevice={(id) => setSelectedDeviceId(id)}
              onNavigateToDashboard={() => setActiveTab('dashboard')}
              onDeleteDevice={handleDeleteDevice}
              onResetAllDevices={handleResetAllDevices}
            />
          )}

          {/* TAB 5: KEY GENERATOR & PROVISIONING */}
          {activeTab === 'provisioning' && (
            <ProvisioningView
              tenants={tenants}
              activeTenant={activeTenant}
              channels={channels}
              devices={devices}
              onDeviceRegistered={handleDeviceRegistered}
            />
          )}

        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 dark:border-slate-800/60 py-4 px-6 text-center text-xs text-slate-500">
          <p>IoT Platform • Enterprise Telemetry Dashboard • TimescaleDB + Mosquitto + ESP32</p>
        </footer>

      </div>

      {/* MODALS */}
      <ProvisionModal
        isOpen={isProvisionModalOpen}
        onClose={() => setIsProvisionModalOpen(false)}
        activeTenantId={activeTenant?.id}
        onDeviceRegistered={handleDeviceRegistered}
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

    </div>
  );
}
