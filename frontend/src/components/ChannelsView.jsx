import React, { useState } from 'react';
import { Radio, Plus, Hash, Copy, Check, Activity, Trash2, ShieldCheck, Cpu, ArrowRight, X, Link as LinkIcon } from 'lucide-react';

export default function ChannelsView({
  channels,
  devices = [],
  onOpenAddChannel,
  onOpenAddDevice,
  onUnlinkDevice,
  onDeleteChannel,
  onSelectDevice,
  onNavigateToDashboard,
  isAdmin = false,
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
            <Radio className="w-6 h-6 text-cyan-500" />
            <span>Groups & Telemetry Channels</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Organize edge devices into logical telemetry streams and MQTT routing groups.
          </p>
        </div>

        {!isAdmin ? (
          <button
            onClick={onOpenAddChannel}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-md shadow-cyan-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Channel</span>
          </button>
        ) : (
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-xs">
            <ShieldCheck className="w-4 h-4 text-cyan-600" />
            <span>Topic Stream Monitor</span>
          </div>
        )}
      </div>

      {/* Channels Grid or Clean Empty State */}
      {channels.length === 0 ? (
        <div className="rounded-2xl p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center flex flex-col items-center justify-center space-y-3 shadow-sm">
          <div className="p-3.5 rounded-2xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20">
            <Radio className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            No Channels Created Yet
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
            {isAdmin 
              ? 'Supervisory Monitor: No telemetry routing channels currently configured in this workspace.'
              : 'Channels organize your devices into telemetry topics. Create your first channel to start routing telemetry.'}
          </p>
          {!isAdmin && (
            <button
              onClick={onOpenAddChannel}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-md shadow-cyan-500/20 mt-1"
            >
              <Plus className="w-4 h-4" />
              <span>Add Channel</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors text-left flex flex-col justify-between shadow-xs"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-400 dark:border-cyan-500/30">
                    {c.group || 'Environmental'}
                  </span>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <Activity className="w-3 h-3" />
                      <span>5s Ingestion</span>
                    </div>

                    {!isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete channel "${c.name}"?`)) {
                            if (onDeleteChannel) onDeleteChannel(c.id);
                          }
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                        title="Delete Channel"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">{c.name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                  {c.description || 'Channel route for temperature and humidity sensor nodes.'}
                </p>

                {/* Channel ID */}
                <div className="mt-4 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Channel ID</span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-cyan-700 dark:text-cyan-300 truncate font-semibold">
                      {c.id}
                    </span>
                    <button
                      onClick={() => handleCopy(c.id)}
                      className="text-slate-400 hover:text-slate-800 dark:hover:text-white transition p-1"
                      title="Copy Channel ID"
                    >
                      {copiedId === c.id ? (
                        <Check className="w-3.5 h-3.5 text-cyan-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Topic Route */}
                <div className="mt-2.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/60 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                  MQTT: <span className="text-slate-800 dark:text-slate-300 font-semibold">{c.topic || `devices/${c.id}/telemetry`}</span>
                </div>

                {/* Connected Devices List */}
                {(() => {
                  const assigned = (devices || []).filter((d) => d.channel_id === c.id);
                  if (assigned.length === 0) {
                    return (
                      <p className="mt-3 text-[11px] text-slate-400 italic">
                        No devices assigned yet.
                      </p>
                    );
                  }
                  return (
                    <div className="mt-3 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                        Linked Sensor Nodes ({assigned.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {assigned.map((d) => (
                          <div
                            key={d.device_id}
                            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-[10px] font-mono bg-cyan-50 hover:bg-cyan-100/80 text-cyan-800 border border-cyan-200 transition"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (onSelectDevice) onSelectDevice(d.device_id);
                                if (onNavigateToDashboard) onNavigateToDashboard();
                              }}
                              className="inline-flex items-center gap-1 font-semibold hover:underline cursor-pointer"
                              title={`Inspect ${d.name || d.device_id}`}
                            >
                              <Cpu className="w-2.5 h-2.5 text-cyan-600" />
                              <span>{d.device_id}</span>
                              <ArrowRight className="w-2.5 h-2.5 opacity-60" />
                            </button>
                            {!isAdmin && onUnlinkDevice && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Unlink sensor "${d.name || d.device_id}" from channel "${c.name}"? It will become a standalone sensor.`)) {
                                    onUnlinkDevice(d.device_id);
                                  }
                                }}
                                className="p-0.5 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                title="Unlink from this channel"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Nodes: <strong className="text-slate-800 dark:text-slate-200">{(devices || []).filter((d) => d.channel_id === c.id).length || c.devices_count || 0} connected</strong></span>
                <button
                  type="button"
                  onClick={() => onOpenAddDevice && onOpenAddDevice(c.id)}
                  className="inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400 hover:underline font-bold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Device</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
