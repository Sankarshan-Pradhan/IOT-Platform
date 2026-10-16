import React, { useState } from 'react';
import { Radio, X, Plus, Sparkles, Hash, FolderTree } from 'lucide-react';
import { generateChannelId } from '../utils/generators';

export default function AddChannelModal({
  isOpen,
  onClose,
  onAddChannel,
  activeTenantId,
}) {
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState('');
  const [group, setGroup] = useState('Environmental Monitoring');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleNameChange = (e) => {
    const val = e.target.value;
    setName(val);
    if (!channelId || channelId.startsWith('chan-')) {
      setChannelId(generateChannelId(val));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    onAddChannel({
      id: channelId || generateChannelId(name),
      name: name.trim(),
      group: group.trim(),
      description: description.trim(),
      tenant_id: activeTenantId,
      topic: `channels/${channelId || generateChannelId(name)}/telemetry`,
      created_at: new Date().toISOString(),
      devices_count: 0,
    });

    setName('');
    setChannelId('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-colors duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-50 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/25">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Create Telemetry Channel / Group</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Define a routing stream and group for ESP32 devices</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
              Channel Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. Lab Zone 1 (ESP32 + DHT22)"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-medium"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Hash className="w-3.5 h-3.5 text-cyan-500" />
                Channel ID
              </span>
              <button
                type="button"
                onClick={() => setChannelId(generateChannelId(name))}
                className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-mono font-semibold"
              >
                <Sparkles className="w-3 h-3" /> Regenerate
              </button>
            </label>
            <input
              type="text"
              required
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="e.g. chan-lab1-8f2a"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-cyan-700 dark:text-cyan-300 font-semibold focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
              <FolderTree className="w-3.5 h-3.5 text-slate-400" />
              Group Classification
            </label>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500 font-medium"
            >
              <option value="Environmental Monitoring">Environmental Monitoring</option>
              <option value="Cleanroom Facility">Cleanroom Facility</option>
              <option value="Server Room HVAC">Server Room HVAC</option>
              <option value="Greenhouse & Agriculture">Greenhouse & Agriculture</option>
              <option value="Industrial Automation">Industrial Automation</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
              Description / Notes
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Channel description, location, or telemetry cadence details..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-cyan-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Create Channel</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
