import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Building2, 
  Users, 
  Radio, 
  Cpu, 
  ShieldCheck, 
  ShieldAlert, 
  Activity, 
  Server, 
  Database, 
  RefreshCw, 
  Play, 
  Pause, 
  Thermometer, 
  Menu, 
  LogOut, 
  Filter, 
  Check, 
  Copy, 
  Sparkles, 
  Clock, 
  Wifi, 
  AlertCircle, 
  ArrowRight,
  Mail,
  Phone,
  Calendar,
  Layers,
  ChevronRight,
  Sliders,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import { TemperatureCard, HumidityCard, SignalHealthCard } from './MetricCard';
import TelemetryChart from './TelemetryChart';
import RecentTable from './RecentTable';
import GuardrailsModal from './GuardrailsModal';
import { 
  fetchHealth, 
  fetchTenants, 
  fetchUsers, 
  fetchChannels, 
  fetchDevices, 
  fetchLatestTelemetry, 
  fetchTelemetryHistory, 
  fetchAlarms, 
  fetchRules,
  acknowledgeAlarm,
  resolveAlarm,
  deleteAlarm
} from '../api';

export default function AdminDashboard({ currentUser, onLogout }) {
  // Navigation tabs: 'workspaces' | 'users' | 'dashboard' | 'devices' | 'channels' | 'guardrails'
  const [activeTab, setActiveTab] = useState('workspaces');
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);

  // Data states
  const [health, setHealth] = useState(null);
  const [userList, setUserList] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [activeTenant, setActiveTenant] = useState(null);
  const [selectedUserFilter, setSelectedUserFilter] = useState('ALL');
  
  const [channels, setChannels] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [viewMode, setViewMode] = useState('single');

  const [latestDataMap, setLatestDataMap] = useState({});
  const [historyData, setHistoryData] = useState([]);
  const [secondDeviceHistory, setSecondDeviceHistory] = useState([]);

  // Telemetry statistics
  const [prevTemp, setPrevTemp] = useState(null);
  const [prevHum, setPrevHum] = useState(null);

  // Alarms & Rules
  const [alarms, setAlarms] = useState([]);
  const [rules, setRules] = useState([]);
  const [isGuardrailsOpen, setIsGuardrailsOpen] = useState(false);

  // UI Settings
  const [tempUnit, setTempUnit] = useState('C');
  const [limit, setLimit] = useState(50);
  const [isPolling, setIsPolling] = useState(true);
  const [countdown, setCountdown] = useState(5);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastPolledAt, setLastPolledAt] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const selectedDeviceRef = useRef(selectedDeviceId);
  selectedDeviceRef.current = selectedDeviceId;

  const handleCopy = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Load Admin System Data
  const loadAdminData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // 1. Healthcheck
      const h = await fetchHealth();
      setHealth(h);

      // 2. Fetch Users Directory (Admin Only)
      const users = await fetchUsers();
      if (Array.isArray(users)) {
        setUserList(users);
      }

      // 3. Fetch All Multi-Tenant Workspaces (Admin receives all)
      const allTenants = await fetchTenants();
      if (Array.isArray(allTenants) && allTenants.length > 0) {
        setTenants(allTenants);
        setActiveTenant((curr) => {
          if (curr) {
            const found = allTenants.find((t) => t.id === curr.id);
            if (found) return found;
          }
          return allTenants[0];
        });
      }

      // 4. Fetch Channels for active tenant
      const activeTId = activeTenant?.id || (allTenants && allTenants[0]?.id) || '';
      if (activeTId) {
        const backendChannels = await fetchChannels(activeTId);
        if (Array.isArray(backendChannels)) {
          setChannels(backendChannels);
        }
      }

      // 5. Fetch Alarms & Safety Rules
      const [backendAlarms, backendRules] = await Promise.all([
        fetchAlarms(''),
        fetchRules(''),
      ]);
      if (Array.isArray(backendAlarms)) setAlarms(backendAlarms);
      if (Array.isArray(backendRules)) setRules(backendRules);

      // 6. Fetch Devices for active tenant
      const devList = await fetchDevices(activeTId);
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

      // 7. Telemetry Snapshot for Selected Device
      const devToFetch = selectedDeviceRef.current;
      if (devToFetch) {
        const [latest, hist] = await Promise.all([
          fetchLatestTelemetry(devToFetch),
          fetchTelemetryHistory(devToFetch, limit),
        ]);

        if (latest) {
          setLatestDataMap((prev) => {
            const oldReading = prev[devToFetch]?.payload;
            const newReading = latest?.payload;
            if (oldReading && newReading) {
              setPrevTemp(oldReading.temperature_c ?? oldReading.temperature);
              setPrevHum(oldReading.humidity_pct ?? oldReading.humidity);
            }
            return { ...prev, [devToFetch]: latest };
          });
        }
        if (Array.isArray(hist)) {
          setHistoryData(hist);
        }
      }

      setLastPolledAt(new Date());
    } catch (err) {
      console.warn('[AdminDashboard] Error polling admin data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [activeTenant?.id, limit]);

  // Initial load
  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  // 5-second countdown ticker
  useEffect(() => {
    if (!isPolling) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadAdminData();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPolling, loadAdminData]);

  // Alarms actions
  const handleAcknowledgeAlarm = async (alarmId) => {
    try {
      await acknowledgeAlarm(alarmId);
      setAlarms((prev) =>
        prev.map((a) => (a.id === alarmId ? { ...a, status: 'ACKNOWLEDGED' } : a))
      );
    } catch (err) {
      alert(`Could not acknowledge alarm: ${err.message}`);
    }
  };

  const handleResolveAlarm = async (alarmId) => {
    try {
      await resolveAlarm(alarmId);
      setAlarms((prev) =>
        prev.map((a) => (a.id === alarmId ? { ...a, status: 'RESOLVED' } : a))
      );
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

  // Filter workspaces for admin if a specific user is selected
  const filteredTenants = selectedUserFilter === 'ALL'
    ? tenants
    : tenants.filter((t) => t.owner_id === selectedUserFilter || t.owner_name === selectedUserFilter);

  // Compute metrics for live monitor
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

  const openAlarmsCount = alarms.filter((a) => a.status === 'OPEN').length;
  const isBackendOk = health && health.status === 'ok';
  const isDbOk = health && health.database === 'connected';

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900 antialiased selection:bg-amber-500/20 selection:text-amber-800">
      
      {/* 1. Left Sidebar Navigation for Admin */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 sm:w-72 bg-white border-r border-slate-200 flex flex-col h-screen select-none transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${
        isSidebarOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        
        {/* Admin Header Branding */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-amber-500/20">
              <ShieldCheck className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold tracking-tight text-slate-900">Admin Console</h1>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
                  SUPERUSER
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Supervisory Monitor</p>
            </div>
          </div>

          {/* Active Workspace Switcher for Admin */}
          <div className="mt-3.5 space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Inspect Workspace
            </label>
            <div className="relative">
              <select
                value={activeTenant?.id || ''}
                onChange={(e) => {
                  const sel = tenants.find((t) => t.id === e.target.value);
                  if (sel) {
                    setActiveTenant(sel);
                    setCountdown(5);
                  }
                }}
                className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500 cursor-pointer appearance-none shadow-xs truncate pr-6"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.owner_name || 'System'})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <ChevronRight className="w-3.5 h-3.5 rotate-90" />
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          
          {/* Card 1: All Workspaces */}
          <button
            onClick={() => setActiveTab('workspaces')}
            className={`w-full rounded-xl p-3 border transition-all text-left flex items-center justify-between ${
              activeTab === 'workspaces'
                ? 'bg-amber-50/80 border-amber-400/80 shadow-sm ring-1 ring-amber-400/40 text-slate-900 font-bold'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${activeTab === 'workspaces' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-100 text-slate-600'}`}>
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold">All Workspaces</h4>
                <p className="text-[11px] text-slate-500">Cross-user overview</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
              {tenants.length}
            </span>
          </button>

          {/* Card 2: Registered Users Directory */}
          <button
            onClick={() => setActiveTab('users')}
            className={`w-full rounded-xl p-3 border transition-all text-left flex items-center justify-between ${
              activeTab === 'users'
                ? 'bg-amber-50/80 border-amber-400/80 shadow-sm ring-1 ring-amber-400/40 text-slate-900 font-bold'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${activeTab === 'users' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-100 text-slate-600'}`}>
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold">User Directory</h4>
                <p className="text-[11px] text-slate-500">All registered accounts</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
              {userList.length}
            </span>
          </button>

          {/* Card 3: Live Telemetry Monitor */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full rounded-xl p-3 border transition-all text-left flex items-center justify-between ${
              activeTab === 'dashboard'
                ? 'bg-amber-50/80 border-amber-400/80 shadow-sm ring-1 ring-amber-400/40 text-slate-900 font-bold'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${activeTab === 'dashboard' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-100 text-slate-600'}`}>
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold">Live Telemetry</h4>
                <p className="text-[11px] text-slate-500">Gauges & trend charts</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              5s Live
            </span>
          </button>

          {/* Card 4: Edge Hardware Inventory */}
          <button
            onClick={() => setActiveTab('devices')}
            className={`w-full rounded-xl p-3 border transition-all text-left flex items-center justify-between ${
              activeTab === 'devices'
                ? 'bg-amber-50/80 border-amber-400/80 shadow-sm ring-1 ring-amber-400/40 text-slate-900 font-bold'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${activeTab === 'devices' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-100 text-slate-600'}`}>
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold">Hardware Nodes</h4>
                <p className="text-[11px] text-slate-500">Active sensors status</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
              {devices.length}
            </span>
          </button>

          {/* Card 5: Channel Streams */}
          <button
            onClick={() => setActiveTab('channels')}
            className={`w-full rounded-xl p-3 border transition-all text-left flex items-center justify-between ${
              activeTab === 'channels'
                ? 'bg-amber-50/80 border-amber-400/80 shadow-sm ring-1 ring-amber-400/40 text-slate-900 font-bold'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${activeTab === 'channels' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-100 text-slate-600'}`}>
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold">MQTT Channels</h4>
                <p className="text-[11px] text-slate-500">Topic routing streams</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
              {channels.length}
            </span>
          </button>

          {/* Card 6: Guardrail Alarms */}
          <button
            onClick={() => setIsGuardrailsOpen(true)}
            className="w-full rounded-xl p-3 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 transition-all text-left flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold">Safety Guardrails</h4>
                <p className="text-[11px] text-slate-500">Threshold alarms & rules</p>
              </div>
            </div>
            {openAlarmsCount > 0 ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
                {openAlarmsCount} OPEN
              </span>
            ) : (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>

        </div>

        {/* Sidebar Footer: Mode Badge */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50 space-y-2">
          <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center gap-2 font-semibold shadow-xs">
            <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>Supervisory Mode Active</span>
          </div>
          <div className="px-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>HTTP :8080</span>
            <span>MQTT :1883</span>
          </div>
        </div>

      </aside>

      {/* Backdrop for mobile */}
      {isSidebarOpenMobile && (
        <div
          onClick={() => setIsSidebarOpenMobile(false)}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm md:hidden"
        />
      )}

      {/* 2. Main Admin Layout */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        
        {/* Top Header Bar */}
        <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSidebarOpenMobile(!isSidebarOpenMobile)}
                className="p-2 text-slate-500 hover:text-slate-900 md:hidden border border-slate-200 rounded-lg bg-white"
              >
                <Menu className="w-5 h-5" />
              </button>
              
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                    Administrator Mission Control
                  </h1>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    Admin
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Global telemetry supervision across all registered user accounts
                </p>
              </div>
            </div>

            {/* Status indicators & Sign out */}
            <div className="flex flex-wrap items-center gap-2">
              
              {/* Backend indicator */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium">
                <Server className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline text-slate-500">API:</span>
                <span className={`flex items-center gap-1 font-semibold ${isBackendOk ? 'text-emerald-600' : 'text-rose-600'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isBackendOk ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  {isBackendOk ? 'Online' : 'Offline'}
                </span>
              </div>

              {/* Database indicator */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium">
                <Database className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline text-slate-500">DB:</span>
                <span className={`flex items-center gap-1 font-semibold ${isDbOk ? 'text-emerald-600' : 'text-amber-600'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isDbOk ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {isDbOk ? 'Ready' : 'Waiting'}
                </span>
              </div>

              {/* Temp unit toggle */}
              <button
                onClick={() => setTempUnit(tempUnit === 'C' ? 'F' : 'C')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 border border-slate-200 transition"
              >
                <Thermometer className="w-3.5 h-3.5 text-emerald-500" />
                <span>°{tempUnit}</span>
              </button>

              {/* Polling controller */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono font-medium">
                <span className="relative flex h-2 w-2">
                  {isPolling && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isPolling ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                </span>
                <span>{isPolling ? `${countdown}s` : 'Paused'}</span>
                <button
                  onClick={() => setIsPolling(!isPolling)}
                  className="p-0.5 text-slate-500 hover:text-slate-800 transition"
                  title={isPolling ? 'Pause polling' : 'Resume polling'}
                >
                  {isPolling ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 text-emerald-600" />}
                </button>
                <button
                  onClick={() => {
                    loadAdminData();
                    setCountdown(5);
                  }}
                  disabled={isRefreshing}
                  className="p-0.5 text-slate-500 hover:text-slate-800 transition disabled:opacity-50"
                  title="Refresh now"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
                </button>
              </div>

              {/* Admin profile & Sign Out */}
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="hidden sm:block text-right">
                  <div className="text-xs font-bold text-slate-900">{currentUser?.name || 'Administrator'}</div>
                  <div className="text-[10px] font-mono text-slate-400">@{currentUser?.username || 'admin'}</div>
                </div>

                <button
                  onClick={onLogout}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition shadow-xs"
                  title="Sign Out of Admin Console"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>

            </div>

          </div>
        </header>

        {/* Dynamic Admin Body */}
        <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
          
          {/* Top Supervisory Stats Ribbon */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-3 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total Registered Users</span>
                <p className="text-xl font-extrabold text-slate-900">{userList.length} Accounts</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total Monitored Workspaces</span>
                <p className="text-xl font-extrabold text-slate-900">{tenants.length} Workspaces</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-3 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-200">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Workspace Devices</span>
                <p className="text-xl font-extrabold text-slate-900">{devices.length} Nodes</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
              <div className={`p-3 rounded-xl border ${openAlarmsCount > 0 ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Guardrail Alarms</span>
                <p className={`text-xl font-extrabold ${openAlarmsCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  {openAlarmsCount} Active
                </p>
              </div>
            </div>
          </div>

          {/* TAB 1: ALL WORKSPACES (Cross-User Inspection) */}
          {activeTab === 'workspaces' && (
            <div className="space-y-4">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-emerald-600" />
                    <span>System Multi-Tenant Workspaces</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Viewing all organizational workspaces across all registered users
                  </p>
                </div>

                {userList.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-500 font-semibold text-[11px]">Filter by Owner:</span>
                    <select
                      value={selectedUserFilter}
                      onChange={(e) => setSelectedUserFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:border-amber-500"
                    >
                      <option value="ALL">All Users ({tenants.length} Workspaces)</option>
                      {userList.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} (@{u.username})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Workspaces Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTenants.map((t) => {
                  const isSelected = activeTenant?.id === t.id;

                  return (
                    <div
                      key={t.id}
                      className={`rounded-2xl p-5 border text-left flex flex-col justify-between shadow-sm relative overflow-hidden transition-all ${
                        isSelected
                          ? 'bg-white border-amber-500 ring-1 ring-amber-500/40 shadow-md'
                          : 'bg-white hover:border-slate-300 border-slate-200'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-amber-500" />
                      )}

                      <div>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-amber-600">
                            <Building2 className="w-5 h-5" />
                          </div>

                          {isSelected ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Currently Monitoring
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setActiveTenant(t);
                                setCountdown(5);
                              }}
                              className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
                            >
                              Inspect Telemetry
                            </button>
                          )}
                        </div>

                        <h3 className="text-base font-bold text-slate-900 tracking-tight">{t.name}</h3>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {t.description || 'Isolated telemetry workspace.'}
                        </p>

                        {/* Owner Badge */}
                        <div className="mt-3.5 p-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 truncate text-slate-600">
                            <span className="font-semibold text-slate-900 truncate">
                              Owner: {t.owner_name || 'System Admin'}
                            </span>
                            {t.owner_email && (
                              <span className="text-slate-400 text-[10px] truncate hidden sm:inline">
                                • {t.owner_email}
                              </span>
                            )}
                          </div>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200 text-slate-700">
                            Account
                          </span>
                        </div>

                        {/* UUID with copy */}
                        <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Workspace UUID</span>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-mono text-emerald-700 truncate">
                              {t.id}
                            </span>
                            <button
                              onClick={() => handleCopy(t.id)}
                              className="text-slate-400 hover:text-slate-800 transition p-1"
                              title="Copy Tenant ID"
                            >
                              {copiedId === t.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>Slug: <strong className="text-slate-700 font-mono">{t.slug}</strong></span>
                        <button
                          onClick={() => {
                            setActiveTenant(t);
                            setActiveTab('dashboard');
                          }}
                          className="text-amber-600 hover:underline font-bold text-[11px] flex items-center gap-1"
                        >
                          <span>Open Live Cockpit</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {/* TAB 2: REGISTERED USERS DIRECTORY */}
          {activeTab === 'users' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-600" />
                    <span>Database Registered Users Directory</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Complete user accounts, credentials, and linked workspace ownership
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  {userList.length} Total Users
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-6 py-3">User & ID</th>
                      <th className="px-6 py-3">Email Address</th>
                      <th className="px-6 py-3">Mobile Number</th>
                      <th className="px-6 py-3">Role</th>
                      <th className="px-6 py-3">Workspaces</th>
                      <th className="px-6 py-3">Registered On</th>
                      <th className="px-6 py-3 text-right">Supervision Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {userList.map((user) => {
                      const isUserAdmin = user.role === 'admin';
                      return (
                        <tr key={user.id} className="hover:bg-slate-50 transition">
                          <td className="px-6 py-3.5">
                            <div className="font-bold text-slate-900">{user.name}</div>
                            <div className="text-[11px] font-mono text-slate-400">@{user.username}</div>
                          </td>

                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <Mail className="w-3.5 h-3.5 text-slate-400" />
                              <span>{user.email}</span>
                            </div>
                          </td>

                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                              <span>{user.mobile || '—'}</span>
                            </div>
                          </td>

                          <td className="px-6 py-3.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isUserAdmin
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                              {user.role}
                            </span>
                          </td>

                          <td className="px-6 py-3.5">
                            <span className="font-bold text-slate-900">
                              {user.workspaces_count ?? 1}
                            </span>
                            <span className="text-slate-400 ml-1">owned</span>
                          </td>

                          <td className="px-6 py-3.5 text-slate-500">
                            {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                          </td>

                          <td className="px-6 py-3.5 text-right">
                            <button
                              onClick={() => {
                                setSelectedUserFilter(user.id);
                                setActiveTab('workspaces');
                              }}
                              className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-[11px] transition shadow-xs"
                            >
                              Inspect Workspaces
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: LIVE TELEMETRY MONITOR */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              
              {/* Device Selector Header (Pure Monitoring) */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Monitoring Workspace: <span className="text-amber-600">{activeTenant?.name}</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Select any active sensor hardware to observe real-time telemetry curves
                    </p>
                  </div>
                </div>

                {devices.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">Sensor Node:</span>
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => {
                        setSelectedDeviceId(e.target.value);
                        setCountdown(5);
                      }}
                      className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                    >
                      {devices.map((d) => (
                        <option key={d.device_id} value={d.device_id}>
                          {d.device_id} ({d.name || 'ESP32'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Devices Grid Selector */}
              {devices.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {devices.map((device) => {
                      const isSelected = selectedDeviceId === device.device_id;
                      const latest = latestDataMap[device.device_id];
                      const devPayload = latest?.payload || {};
                      const isOnline = device.status === 'online';

                      return (
                        <div
                          key={device.device_id}
                          onClick={() => setSelectedDeviceId(device.device_id)}
                          className={`cursor-pointer rounded-2xl p-4 transition-all border text-left relative overflow-hidden shadow-sm ${
                            isSelected
                              ? 'bg-white border-amber-500 ring-1 ring-amber-500/40 shadow-md'
                              : 'bg-white hover:border-slate-300 border-slate-200'
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                          )}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-slate-900">
                                <span>{device.device_id}</span>
                                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />}
                              </div>
                              <span className="text-[11px] text-slate-500">{device.name || 'ESP32 Node'}</span>
                            </div>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              isOnline ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                              {device.status || 'online'}
                            </span>
                          </div>

                          <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-slate-400 text-[10px] uppercase font-bold">Temperature</span>
                              <p className="font-mono font-bold text-slate-800">
                                {devPayload.temperature_c !== undefined ? `${devPayload.temperature_c.toFixed(1)} °C` : '—'}
                              </p>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[10px] uppercase font-bold">Humidity</span>
                              <p className="font-mono font-bold text-slate-800">
                                {devPayload.humidity_pct !== undefined ? `${devPayload.humidity_pct.toFixed(1)} %` : '—'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

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
                    isCompareMode={false}
                  />

                  {/* Recent Ingestion Table */}
                  <RecentTable historyData={historyData} tempUnit={tempUnit} />
                </>
              ) : (
                <div className="rounded-2xl p-12 bg-white border border-slate-200 text-center space-y-3 shadow-sm">
                  <Cpu className="w-12 h-12 text-slate-300 mx-auto" />
                  <h3 className="text-base font-bold text-slate-800">No Sensor Hardware Streaming in this Workspace</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Supervisory Monitor: Awaiting incoming telemetry from edge devices for workspace "{activeTenant?.name}".
                  </p>
                </div>
              )}

              {/* Read-Only Status Bar */}
              <div className="rounded-2xl bg-white border border-slate-200 p-4 flex items-center justify-between text-xs text-slate-600 shadow-sm">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Admin Supervisory Monitor active • Read-Only Telemetry Streaming</span>
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Last sync: {lastPolledAt ? lastPolledAt.toLocaleTimeString() : '—'}
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: EDGE HARDWARE INVENTORY (Pure Monitoring) */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-emerald-600" />
                    <span>Hardware Edge Nodes Inventory</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Live microcontroller statuses across active workspace ({activeTenant?.name})
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                  {devices.length} Devices
                </span>
              </div>

              {devices.length === 0 ? (
                <div className="rounded-2xl p-10 bg-white border border-slate-200 text-center space-y-2">
                  <Cpu className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">No hardware registered</p>
                  <p className="text-xs text-slate-400">Incoming MQTT telemetry will auto-register devices automatically.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {devices.map((device) => {
                    const latest = latestDataMap[device.device_id];
                    const devPayload = latest?.payload || {};
                    const isOnline = device.status === 'online';

                    return (
                      <div key={device.device_id} className="rounded-2xl p-5 bg-white border border-slate-200 shadow-sm text-left flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-emerald-600">
                              <Cpu className="w-5 h-5" />
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              isOnline ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {device.status || 'online'}
                            </span>
                          </div>

                          <h3 className="text-base font-bold text-slate-900 truncate">{device.name || device.device_id}</h3>
                          <p className="text-xs font-mono text-emerald-600 mt-0.5">ID: {device.device_id}</p>

                          <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase font-bold">Temperature</span>
                              <p className="font-mono font-bold text-amber-600 mt-0.5">
                                {devPayload.temperature_c !== undefined ? `${devPayload.temperature_c.toFixed(1)} °C` : '—'}
                              </p>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase font-bold">Humidity</span>
                              <p className="font-mono font-bold text-cyan-600 mt-0.5">
                                {devPayload.humidity_pct !== undefined ? `${devPayload.humidity_pct.toFixed(1)} %` : '—'}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                            <span>Type: {device.device_type || 'ESP32'}</span>
                            {devPayload.wifi_rssi && (
                              <span className="text-emerald-600 flex items-center gap-1">
                                <Wifi className="w-3 h-3" /> {devPayload.wifi_rssi} dBm
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                          <span className="text-[11px] font-mono text-slate-400">
                            {latest?.time ? `Sync: ${new Date(latest.time).toLocaleTimeString()}` : 'Awaiting sync'}
                          </span>
                          <button
                            onClick={() => {
                              setSelectedDeviceId(device.device_id);
                              setActiveTab('dashboard');
                            }}
                            className="text-amber-600 hover:underline font-bold text-xs flex items-center gap-1"
                          >
                            <span>Inspect</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: CHANNELS MONITOR (Pure Monitoring) */}
          {activeTab === 'channels' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Radio className="w-4 h-4 text-cyan-600" />
                    <span>MQTT Telemetry Routing Channels</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Central pub/sub topics configured across active workspace ({activeTenant?.name})
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                  {channels.length} Channels
                </span>
              </div>

              {channels.length === 0 ? (
                <div className="rounded-2xl p-10 bg-white border border-slate-200 text-center space-y-2">
                  <Radio className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">No channels configured</p>
                  <p className="text-xs text-slate-400">Channels organize devices into MQTT routing groups.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {channels.map((c) => (
                    <div key={c.id} className="rounded-2xl p-5 bg-white border border-slate-200 shadow-sm text-left flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
                            {c.group || 'Environmental'}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-600 flex items-center gap-1 font-semibold">
                            <Activity className="w-3 h-3" />
                            <span>5s QoS 1</span>
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-slate-900">{c.name}</h3>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.description || 'Telemetry route.'}</p>

                        <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Channel ID</span>
                          <span className="text-[11px] font-mono text-cyan-700 block truncate">{c.id}</span>
                        </div>

                        <div className="mt-2.5 p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-600">
                          <span className="text-slate-400 text-[10px] uppercase font-bold">Topic:</span>
                          <span className="text-emerald-700 font-semibold">{c.topic || 'devices/+/telemetry'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500 bg-white">
          <p>IoT Platform • Administrator Supervisory Center • TimescaleDB + Mosquitto + ESP32</p>
        </footer>

      </div>

      {/* Guardrails Modal (Supervisor Mode) */}
      <GuardrailsModal
        isOpen={isGuardrailsOpen}
        onClose={() => setIsGuardrailsOpen(false)}
        alarms={alarms}
        rules={rules}
        onAcknowledgeAlarm={handleAcknowledgeAlarm}
        onResolveAlarm={handleResolveAlarm}
        onDeleteAlarm={handleDeleteAlarm}
        activeTenantId={activeTenant?.id}
        isAdmin={true}
      />

    </div>
  );
}
