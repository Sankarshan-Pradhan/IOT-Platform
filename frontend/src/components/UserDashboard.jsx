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
import { OnboardingBanner, EmptyDashboardState } from './OnboardingGuide';
import { 
  fetchHealth, 
  fetchTenants, 
  createTenant, 
  deleteTenant, 
  fetchChannels, 
  createChannel, 
  deleteChannel, 
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
  deleteAlarm 
} from '../api';
import { Sparkles, AlertCircle, Menu, Plus, Trash2 } from 'lucide-react';

export default function UserDashboard({ currentUser, onLogout }) {
  // Navigation tabs: 'tenants' (Workspaces) | 'dashboard' (Live Dashboard) | 'devices' (Clients) | 'channels' (Groups)
  const [activeTab, setActiveTab] = useState('tenants');
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);

  // First-time user onboarding banner
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return localStorage.getItem('iot_hide_onboarding') !== 'true';
  });

  // User's workspaces
  const [tenants, setTenants] = useState([]);
  const [activeTenant, setActiveTenant] = useState(null);

  // User's channels & devices
  const [channels, setChannels] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [viewMode, setViewMode] = useState('single');

  // Modals state
  const [isAddDeviceModalOpen, setIsAddDeviceModalOpen] = useState(false);
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
  const [isPolling, setIsPolling] = useState(true);
  const [countdown, setCountdown] = useState(5);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastPolledAt, setLastPolledAt] = useState(null);

  const selectedDeviceRef = useRef(selectedDeviceId);
  selectedDeviceRef.current = selectedDeviceId;

  // Load User Data
  const loadUserData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // 1. Healthcheck
      const h = await fetchHealth();
      setHealth(h);

      // 2. Fetch User's Workspaces (User-Scoped)
      const userTenants = await fetchTenants();
      if (Array.isArray(userTenants) && userTenants.length > 0) {
        setTenants(userTenants);
        setActiveTenant((curr) => {
          if (curr) {
            const found = userTenants.find((t) => t.id === curr.id);
            if (found) return found;
          }
          return userTenants[0];
        });
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

      // 6. Fetch Telemetry for Selected Device
      const devId = selectedDeviceRef.current;
      if (devId) {
        const [latest, hist] = await Promise.all([
          fetchLatestTelemetry(devId),
          fetchTelemetryHistory(devId, limit),
        ]);

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
      }

      setLastPolledAt(new Date());
    } catch (err) {
      console.warn('[UserDashboard] Error polling data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [activeTenant?.id, limit]);

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
      const created = await createTenant(tenantData);
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
  const handleDeviceRegistered = (newDevice) => {
    setDevices((prev) => [...prev, newDevice]);
    setSelectedDeviceId(newDevice.device_id);
    setIsAddDeviceModalOpen(false);
    loadUserData();
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

  const secondDeviceId = devices.find((d) => d.device_id !== selectedDeviceId)?.device_id || '';

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
            />
          </div>
        </div>

        {/* Dynamic View Content based on activeTab */}
        <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
          
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
              onOpenAddDevice={() => setIsAddDeviceModalOpen(true)}
              onDeleteTenant={handleDeleteTenant}
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
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={(id) => {
                  setSelectedDeviceId(id);
                  setCountdown(5);
                }}
                latestDataMap={latestDataMap}
                viewMode={viewMode}
                setViewMode={setViewMode}
                onOpenAddDevice={() => setIsAddDeviceModalOpen(true)}
                onDeleteDevice={handleDeleteDevice}
                isAdmin={false}
              />

              {/* Only show live metric cards and charts if there is a selected device with data */}
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
                  />

                  {/* Recent Ingestion Table */}
                  <RecentTable historyData={historyData} tempUnit={tempUnit} />
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
              latestDataMap={latestDataMap}
              onOpenAddDevice={() => setIsAddDeviceModalOpen(true)}
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
              onOpenAddChannel={() => setIsAddChannelModalOpen(true)}
              onOpenAddDevice={() => setIsAddDeviceModalOpen(true)}
              onDeleteChannel={handleDeleteChannel}
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
        onClose={() => setIsAddDeviceModalOpen(false)}
        activeTenantId={activeTenant?.id}
        channels={channels}
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
