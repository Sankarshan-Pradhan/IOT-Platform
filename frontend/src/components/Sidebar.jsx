import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Radio,
  Cpu,
  Key,
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
  onOpenProvision,
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
          <button
            onClick={onOpenAddTenant}
            className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 font-semibold transition"
            title="Create New Tenant Workspace"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>

        {/* Tenant Selector Dropdown / Card */}
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
        
        {/* Navigation Card: Live Dashboard */}
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
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Live cards & line chart</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              5s
            </span>
          </div>
        </div>

        {/* Navigation Card: Tenants & Workspaces */}
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
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">Tenants / Workspace</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Multi-tenant isolation</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              {tenants.length}
            </span>
          </div>
        </div>

        {/* Navigation Card: Groups & Channels */}
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
                <p className="text-[11px] text-slate-500 dark:text-slate-400">MQTT stream routing</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              {channels.length}
            </span>
          </div>
        </div>

        {/* Navigation Card: Clients & Edge Devices */}
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
                <p className="text-[11px] text-slate-500 dark:text-slate-400">ESP32 node registry</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              {devices.length}
            </span>
          </div>
        </div>

        {/* Navigation Card: Key Generator & Provisioning */}
        <div
          onClick={() => setActiveTab('provisioning')}
          className={`group rounded-xl p-3 border transition-all cursor-pointer relative overflow-hidden ${
            activeTab === 'provisioning'
              ? 'bg-amber-50/70 dark:bg-slate-800/90 border-amber-500/60 shadow-sm dark:shadow-lg dark:shadow-amber-500/10 ring-1 ring-amber-500/30'
              : 'bg-slate-50/70 hover:bg-slate-100 dark:bg-slate-950/40 dark:hover:bg-slate-800/50 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          {activeTab === 'provisioning' && (
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${
                activeTab === 'provisioning' 
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' 
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400'
              }`}>
                <Key className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">Key & Config Generator</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Tenant, Channel & Secrets</p>
              </div>
            </div>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              Keys
            </span>
          </div>
        </div>

      </div>

      {/* 3. Quick Provisioning ESP32 Banner Card */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5 bg-slate-50/50 dark:bg-transparent">
        <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-50 via-white to-slate-50 dark:from-emerald-950/80 dark:via-slate-900 dark:to-slate-950 border border-emerald-500/30 shadow-sm dark:shadow-lg text-left">
          <div className="flex items-center gap-2 mb-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-bold text-slate-900 dark:text-white">Connect ESP32</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
            Generate your Channel ID, Tenant UUID, and Secret Key for flashing.
          </p>
          <button
            onClick={onOpenProvision}
            className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Generate Credentials</span>
          </button>
        </div>

        {/* Server & Broker Ports info */}
        <div className="px-2 py-1 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>API :8080</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
            <span>MQTT :1883</span>
          </div>
        </div>
      </div>

    </aside>
  );
}
