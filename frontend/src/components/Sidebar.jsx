import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Radio,
  Cpu,
  Plus,
  Layers,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

export default function Sidebar({
  activeTab,
  setActiveTab,
  tenants,
  activeTenant,
  setActiveTenant,
  channels,
  devices,
  onOpenAddTenant,
  onOpenAddDevice,
  isAdmin = false,
}) {
  return (
    <aside className="w-64 sm:w-72 bg-white dark:bg-slate-900/95 border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen sticky top-0 z-40 select-none transition-colors duration-200">
      
      {/* 1. Workspace / Tenant Header Card */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-transparent">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-500" />
            Current Workspace
          </span>
          {!isAdmin && (
            <button
              onClick={onOpenAddTenant}
              className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 font-semibold transition"
              title="Create New Workspace"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          )}
        </div>

        {/* Tenant Selector Dropdown */}
        <div className="relative">
          <select
            value={activeTenant?.id || ''}
            onChange={(e) => {
              const selected = tenants.find((t) => t.id === e.target.value);
              if (selected) setActiveTenant(selected);
            }}
            className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500 cursor-pointer appearance-none transition shadow-sm"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
            <ChevronRight className="w-4 h-4 rotate-90" />
          </div>
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-1.5 truncate">
          ID: {activeTenant?.id ? `${activeTenant.id.slice(0, 18)}...` : 'Default'}
        </p>
      </div>

      {/* 2. Navigation Cards Menu */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        
        {/* Navigation Card 1: Workspaces / Multi-Tenancy (Top) */}
        <div
          onClick={() => setActiveTab('tenants')}
          className={`group rounded-xl p-3 border transition-all cursor-pointer relative overflow-hidden ${
            activeTab === 'tenants'
              ? 'bg-emerald-50/70 dark:bg-slate-800/90 border-emerald-500/60 shadow-sm dark:shadow-lg dark:shadow-emerald-500/10 ring-1 ring-emerald-500/30'
              : 'bg-slate-50/70 hover:bg-slate-100 dark:bg-slate-950/40 dark:hover:bg-slate-800/50 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          {activeTab === 'tenants' && (
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${
                activeTab === 'tenants' 
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
              }`}>
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">Workspaces</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Multi-tenant management</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              {tenants.length}
            </span>
          </div>
        </div>

        {/* Navigation Card 2: Live Dashboard */}
        <div
          onClick={() => setActiveTab('dashboard')}
          className={`group rounded-xl p-3 border transition-all cursor-pointer relative overflow-hidden ${
            activeTab === 'dashboard'
              ? 'bg-emerald-50/70 dark:bg-slate-800/90 border-emerald-500/60 shadow-sm dark:shadow-lg dark:shadow-emerald-500/10 ring-1 ring-emerald-500/30'
              : 'bg-slate-50/70 hover:bg-slate-100 dark:bg-slate-950/40 dark:hover:bg-slate-800/50 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          {activeTab === 'dashboard' && (
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${
                activeTab === 'dashboard' 
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
              }`}>
                <LayoutDashboard className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">Live Dashboard</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Live cards & trends</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              5s
            </span>
          </div>
        </div>

        {/* Navigation Card 3: Clients & Edge Devices */}
        <div
          onClick={() => setActiveTab('devices')}
          className={`group rounded-xl p-3 border transition-all cursor-pointer relative overflow-hidden ${
            activeTab === 'devices'
              ? 'bg-emerald-50/70 dark:bg-slate-800/90 border-emerald-500/60 shadow-sm dark:shadow-lg dark:shadow-emerald-500/10 ring-1 ring-emerald-500/30'
              : 'bg-slate-50/70 hover:bg-slate-100 dark:bg-slate-950/40 dark:hover:bg-slate-800/50 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          {activeTab === 'devices' && (
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${
                activeTab === 'devices' 
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
              }`}>
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">Clients / Devices</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Sensor node inventory</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              {devices.length}
            </span>
          </div>
        </div>

        {/* Navigation Card 4: Groups & Channels */}
        <div
          onClick={() => setActiveTab('channels')}
          className={`group rounded-xl p-3 border transition-all cursor-pointer relative overflow-hidden ${
            activeTab === 'channels'
              ? 'bg-cyan-50/70 dark:bg-slate-800/90 border-cyan-500/60 shadow-sm dark:shadow-lg dark:shadow-cyan-500/10 ring-1 ring-cyan-500/30'
              : 'bg-slate-50/70 hover:bg-slate-100 dark:bg-slate-950/40 dark:hover:bg-slate-800/50 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          {activeTab === 'channels' && (
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500" />
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${
                activeTab === 'channels' 
                  ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' 
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400'
              }`}>
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">Groups & Channels</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Stream topic routing</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              {channels.length}
            </span>
          </div>
        </div>

      </div>

      {/* 3. Bottom Device Action & Connection Status */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5 bg-slate-50/50 dark:bg-transparent">
        {!isAdmin ? (
          <button
            onClick={onOpenAddDevice}
            className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Register New Device</span>
          </button>
        ) : (
          <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center justify-center gap-2 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
            <span>Supervisory Mode Active</span>
          </div>
        )}

        {/* Ports info */}
        <div className="px-2 py-1 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>HTTP API :8080</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
            <span>MQTT :1883</span>
          </div>
        </div>
      </div>

    </aside>
  );
}
