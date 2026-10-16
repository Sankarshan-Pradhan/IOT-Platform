import React, { useState } from 'react';
import { Radio, Plus, Hash, Copy, Check, FolderTree, Activity } from 'lucide-react';

export default function ChannelsView({
  channels,
  onOpenAddChannel,
  onOpenProvision,
}) {
  const [copiedId, setCopiedId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState('ALL');

  const handleCopy = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const groups = ['ALL', ...new Set(channels.map((c) => c.group || 'Default'))];

  const filteredChannels = selectedGroup === 'ALL'
    ? channels
    : channels.filter((c) => (c.group || 'Default') === selectedGroup);

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

        <button
          onClick={onOpenAddChannel}
          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-md shadow-cyan-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>Add Channel / Group</span>
        </button>
      </div>

      {/* Group Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mr-1">
          <FolderTree className="w-3.5 h-3.5 text-cyan-500" />
          Filter Group:
        </span>
        {groups.map((grp) => (
          <button
            key={grp}
            onClick={() => setSelectedGroup(grp)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedGroup === grp
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
            }`}
          >
            {grp}
          </button>
        ))}
      </div>

      {/* Channels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredChannels.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all text-left flex flex-col justify-between shadow-sm"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-400 dark:border-cyan-500/30">
                  {c.group || 'Environmental'}
                </span>

                <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <Activity className="w-3 h-3" />
                  <span>5s Ingestion</span>
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
            </div>

            {/* Footer */}
            <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Nodes: <strong className="text-slate-800 dark:text-slate-200">{c.devices_count || 0} connected</strong></span>
              <button
                onClick={onOpenProvision}
                className="text-cyan-600 dark:text-cyan-400 hover:underline font-semibold transition"
              >
                + Connect Node
              </button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
