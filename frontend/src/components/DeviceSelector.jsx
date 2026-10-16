import React from 'react';
import { Cpu, Wifi, WifiOff, CheckCircle2, Clock, Plus, Key } from 'lucide-react';

export default function DeviceSelector({
  devices,
  selectedDeviceId,
  onSelectDevice,
  latestDataMap,
  viewMode,
  setViewMode,
  onOpenProvision,
}) {
  if (!devices || devices.length === 0) {
    return (
      <div className="rounded-2xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-200 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              No Devices Connected to this Workspace
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Devices are isolated by tenant. Generate credentials to connect your first ESP32 node.
            </p>
          </div>
        </div>

        <button
          onClick={onOpenProvision}
          className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-md shadow-emerald-500/20 whitespace-nowrap"
        >
          <Key className="w-4 h-4" />
          <span>Provision ESP32</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-emerald-500" />
          <span>Connected Edge Devices ({devices.length})</span>
        </h2>

        {/* View mode toggle (if 2+ devices) */}
        {devices.length > 1 && (
          <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-0.5 text-xs">
            <button
              onClick={() => setViewMode('single')}
              className={`px-3 py-1 rounded-md transition font-medium ${
                viewMode === 'single'
                  ? 'bg-white dark:bg-emerald-500 text-slate-900 dark:text-slate-950 font-bold shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Single Focus
            </button>
            <button
              onClick={() => setViewMode('compare')}
              className={`px-3 py-1 rounded-md transition font-medium ${
                viewMode === 'compare'
                  ? 'bg-white dark:bg-emerald-500 text-slate-900 dark:text-slate-950 font-bold shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Compare Both
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {devices.map((device) => {
          const isSelected = selectedDeviceId === device.device_id && viewMode === 'single';
          const latest = latestDataMap[device.device_id];
          const payload = latest?.payload || {};
          const isOnline = device.status === 'online';

          return (
            <div
              key={device.device_id}
              onClick={() => {
                onSelectDevice(device.device_id);
                if (viewMode === 'compare') setViewMode('single');
              }}
              className={`cursor-pointer rounded-2xl p-4 transition-all duration-200 border text-left relative overflow-hidden group shadow-sm ${
                isSelected
                  ? 'bg-white dark:bg-slate-900 border-emerald-500 dark:border-emerald-500/80 shadow-md ring-1 ring-emerald-500/40'
                  : 'bg-white/80 hover:bg-white dark:bg-slate-900/60 dark:hover:bg-slate-900 border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
              }`}
            >
              {/* Top Accent line when selected */}
              {isSelected && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-400" />
              )}

              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                      {device.device_id}
                    </span>
                    {isSelected && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {device.name || 'ESP32 Telemetry Node'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      isOnline
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                      }`}
                    />
                    {device.status || 'online'}
                  </span>
                </div>
              </div>

              {/* Quick Glance Metrics */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px] uppercase font-bold">Temperature</span>
                  <p className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {payload.temperature_c !== undefined
                      ? `${payload.temperature_c.toFixed(1)} °C`
                      : latest?.temperature !== undefined
                      ? `${latest.temperature.toFixed(1)} °C`
                      : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px] uppercase font-bold">Humidity</span>
                  <p className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {payload.humidity_pct !== undefined
                      ? `${payload.humidity_pct.toFixed(1)} %`
                      : latest?.humidity !== undefined
                      ? `${latest.humidity.toFixed(1)} %`
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Footer info: RSSI & Last packet */}
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                <div className="flex items-center gap-1">
                  {payload.wifi_rssi ? (
                    <>
                      <Wifi className="w-3 h-3 text-emerald-500" />
                      <span>{payload.wifi_rssi} dBm</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3 text-slate-400" />
                      <span>WiFi Ready</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>
                    {latest?.time ? new Date(latest.time).toLocaleTimeString() : 'Awaiting data'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
