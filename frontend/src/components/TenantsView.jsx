import React, { useState } from 'react';
import { Building2, Plus, Layers, Copy, Check, ShieldCheck, ArrowRight } from 'lucide-react';

export default function TenantsView({
  tenants,
  activeTenant,
  setActiveTenant,
  onOpenAddTenant,
  onOpenProvision,
  devicesCountByTenant = {},
}) {
  const [copiedId, setCopiedId] = useState(null);

  const handleCopy = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-emerald-500" />
            <span>Workspaces & Multi-Tenants</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Isolate telemetry streams, devices, and permissions across organizational boundaries.
          </p>
        </div>

        <button
          onClick={onOpenAddTenant}
          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-md shadow-emerald-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>Add Workspace / Tenant</span>
        </button>
      </div>

      {/* Tenants Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tenants.map((t) => {
          const isActive = activeTenant?.id === t.id;
          const devCount = devicesCountByTenant[t.id] ?? 0;

          return (
            <div
              key={t.id}
              className={`rounded-2xl p-5 border transition-all text-left relative overflow-hidden flex flex-col justify-between shadow-sm ${
                isActive
                  ? 'bg-white dark:bg-slate-900 border-emerald-500 dark:border-emerald-500/80 shadow-md ring-1 ring-emerald-500/40'
                  : 'bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              {isActive && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-400" />
              )}

              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-400">
                    <Layers className="w-5 h-5" />
                  </div>

                  {isActive ? (
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active Workspace
                    </span>
                  ) : (
                    <button
                      onClick={() => setActiveTenant(t)}
                      className="text-[11px] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      Switch here
                    </button>
                  )}
                </div>

                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">{t.name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                  {t.description || 'Dedicated multi-tenant workspace with isolated telemetry storage.'}
                </p>

                {/* Tenant UUID */}
                <div className="mt-4 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Tenant UUID</span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300 truncate">
                      {t.id}
                    </span>
                    <button
                      onClick={() => handleCopy(t.id)}
                      className="text-slate-400 hover:text-slate-800 dark:hover:text-white transition p-1"
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

              {/* Card Footer */}
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Slug: <strong className="text-slate-700 dark:text-slate-300 font-mono">{t.slug}</strong></span>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                  {devCount} devices
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Provisioning Callout */}
      <div className="rounded-2xl p-5 bg-gradient-to-r from-emerald-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-850 border border-emerald-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Need to connect a new ESP32 board to this workspace?</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Generate a unique Secret Key, Channel ID, and firmware config with one click.
            </p>
          </div>
        </div>

        <button
          onClick={onOpenProvision}
          className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition whitespace-nowrap shadow-sm"
        >
          <span>Provision Device</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
}
