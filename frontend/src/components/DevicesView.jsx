import React, { useState } from 'react';
import { Cpu, Plus, Wifi, Copy, Check, ShieldCheck, ArrowRight, Key, Trash2 } from 'lucide-react';

export default function DevicesView({
  devices,
  latestDataMap,
  onOpenProvision,
  onSelectDevice,
  onNavigateToDashboard,
  onDeleteDevice,
  onResetAllDevices,
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
            <Cpu className="w-6 h-6 text-emerald-500" />
            <span>Clients & Edge Devices</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Registered ESP32 microcontrollers streaming live telemetry over MQTT.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {devices && devices.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to clear all devices and telemetry from this workspace?')) {
                  onResetAllDevices();
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
              title="Clear all test devices and reset workspace"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All Devices</span>
            </button>
          )}

          <button
            onClick={onOpenProvision}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-md shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Provision New ESP32</span>
          </button>
        </div>
      </div>

      {/* Empty State if no devices */}
      {(!devices || devices.length === 0) ? (
        <div className="rounded-2xl p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center mx-auto">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No devices in this workspace</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Devices are tied to their workspace tenant. Click below to generate your Tenant ID, Channel ID, and Secret Key to connect an ESP32.
            </p>
          </div>
          <button
            onClick={onOpenProvision}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2 transition shadow"
          >
            <Key className="w-4 h-4" />
            <span>Provision ESP32 Node</span>
          </button>
        </div>
      ) : (
        /* Devices Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => {
            const latest = latestDataMap[device.device_id];
            const payload = latest?.payload || {};
            const isOnline = device.status === 'online';

            return (
              <div
                key={device.device_id}
                className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all text-left flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-400">
                      <Cpu className="w-5 h-5" />
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        isOnline
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30'
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

                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">{device.name}</h3>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopy(device.device_id)}
                        className="text-slate-400 hover:text-slate-800 dark:hover:text-white transition p-1 rounded-md"
                        title="Copy Device ID"
                      >
                        {copiedId === device.device_id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete device "${device.name || device.device_id}"?`)) {
                            onDeleteDevice(device.device_id);
                          }
                        }}
                        className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-500/10"
                        title="Delete Device"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                    ID: {device.device_id}
                  </p>

                  {/* Latest metrics preview */}
                  <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold">Temperature</span>
                      <p className="font-mono text-amber-600 dark:text-amber-400 font-bold mt-0.5">
                        {payload.temperature_c !== undefined
                          ? `${payload.temperature_c.toFixed(1)} °C`
                          : latest?.temperature !== undefined
                          ? `${latest.temperature.toFixed(1)} °C`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold">Humidity</span>
                      <p className="font-mono text-cyan-600 dark:text-cyan-400 font-bold mt-0.5">
                        {payload.humidity_pct !== undefined
                          ? `${payload.humidity_pct.toFixed(1)} %`
                          : latest?.humidity !== undefined
                          ? `${latest.humidity.toFixed(1)} %`
                          : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Hardware specs */}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    <span>Type: <strong className="text-slate-800 dark:text-slate-200">{device.device_type || 'ESP32'}</strong></span>
                    {payload.wifi_rssi && (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                        <Wifi className="w-3 h-3" /> {payload.wifi_rssi} dBm
                      </span>
                    )}
                  </div>
                </div>

                {/* Action: Open in Dashboard */}
                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                    {latest?.time ? `Updated ${new Date(latest.time).toLocaleTimeString()}` : 'Awaiting sync'}
                  </span>
                  <button
                    onClick={() => {
                      onSelectDevice(device.device_id);
                      onNavigateToDashboard();
                    }}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-bold flex items-center gap-1 transition"
                  >
                    <span>View Telemetry</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
