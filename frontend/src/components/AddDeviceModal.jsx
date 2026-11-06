import React, { useState, useEffect } from 'react';
import { Cpu, X, Plus, Radio, Layers, CheckCircle2, ArrowRight, RefreshCw, Link as LinkIcon } from 'lucide-react';

export default function AddDeviceModal({
  isOpen,
  onClose,
  activeTenantId,
  channels = [],
  devices = [],
  initialChannelId = '',
  initialMode = 'existing',
  onDeviceRegistered,
  onDeviceAssigned,
}) {
  // Mode: 'existing' (Choose from previously generated devices) or 'new' (Register brand new device)
  const [mode, setMode] = useState('existing');

  // Existing Device State
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [assignChannelId, setAssignChannelId] = useState('');
  const [isAssignSuccess, setIsAssignSuccess] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  // New Device State
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newName, setNewName] = useState('');
  const [newChannelId, setNewChannelId] = useState('');
  const [newDeviceType, setNewDeviceType] = useState('ESP32 + DHT22');
  const [isRegisterSuccess, setIsRegisterSuccess] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Determine initial mode
      const hasExisting = Array.isArray(devices) && devices.length > 0;
      if (initialMode === 'existing' && hasExisting) {
        setMode('existing');
      } else if (!hasExisting) {
        setMode('new');
      } else {
        setMode(initialMode || 'existing');
      }

      // Pre-fill target channel
      const defaultChan = initialChannelId || (channels[0]?.id || '');
      setAssignChannelId(defaultChan);
      setNewChannelId(defaultChan);

      // Pre-select first device
      if (hasExisting) {
        // Prefer standalone or first device
        const standalone = devices.find((d) => !d.channel_id);
        setSelectedDeviceId(standalone ? standalone.device_id : devices[0].device_id);
      } else {
        setSelectedDeviceId('');
      }

      // Generate random new device ID
      const randomSuffix = Math.floor(10 + Math.random() * 90);
      setNewDeviceId(`esp32-sensor-${randomSuffix}`);
      setNewName(`Sensor Node ${randomSuffix}`);
      setNewDeviceType('ESP32 + DHT22');

      setIsAssignSuccess(false);
      setIsRegisterSuccess(false);
      setIsAssigning(false);
      setIsRegistering(false);
    }
  }, [isOpen, initialChannelId, initialMode, channels, devices]);

  if (!isOpen) return null;

  // Selected device object for preview
  const selectedDev = (devices || []).find((d) => d.device_id === selectedDeviceId);
  const currentDevChan = (channels || []).find((c) => c.id === selectedDev?.channel_id);
  const targetChan = (channels || []).find((c) => c.id === assignChannelId);
  const isAlreadyInTarget = selectedDev && selectedDev.channel_id === assignChannelId;

  // Handler: Assign Existing Device
  const handleAssignExisting = async (e) => {
    e.preventDefault();
    if (!selectedDeviceId || !assignChannelId || isAlreadyInTarget) return;

    setIsAssigning(true);
    try {
      if (onDeviceAssigned) {
        await onDeviceAssigned(selectedDeviceId, assignChannelId);
      }
      setIsAssignSuccess(true);
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      console.error('Failed assigning device to channel:', err);
    } finally {
      setIsAssigning(false);
    }
  };

  // Handler: Register Brand New Device
  const handleRegisterNew = async (e) => {
    e.preventDefault();
    if (!newDeviceId.trim() || !newName.trim()) return;

    setIsRegistering(true);
    try {
      if (onDeviceRegistered) {
        await onDeviceRegistered({
          device_id: newDeviceId.trim().toLowerCase().replace(/\s+/g, '-'),
          tenant_id: activeTenantId || 'a0000000-0000-0000-0000-000000000001',
          channel_id: newChannelId,
          name: newName.trim(),
          device_type: newDeviceType,
          status: 'online',
          created_at: new Date().toISOString(),
        });
      }
      setIsRegisterSuccess(true);
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      console.error('Failed registering device:', err);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-colors duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-50 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/25">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {targetChan ? `Add Device to "${targetChan.name}"` : 'Manage Channel Devices'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Link existing workspace sensors or register a new edge device
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher (Choose Existing vs Register New) */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-950 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setMode('existing')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              mode === 'existing'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5 text-cyan-500" />
            <span>Select Existing Device</span>
            {devices.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200">
                {devices.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMode('new')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              mode === 'new'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5 text-emerald-500" />
            <span>Register Brand New Device</span>
          </button>
        </div>

        {/* TAB 1: CHOOSE EXISTING DEVICE */}
        {mode === 'existing' && (
          <form onSubmit={handleAssignExisting} className="p-6 space-y-4">
            {(!devices || devices.length === 0) ? (
              <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-3">
                <p className="text-xs font-semibold text-amber-900">
                  No devices currently exist in this workspace.
                </p>
                <p className="text-[11px] text-amber-700">
                  Switch to the "Register Brand New Device" tab to create your first sensor node.
                </p>
                <button
                  type="button"
                  onClick={() => setMode('new')}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register First Device</span>
                </button>
              </div>
            ) : (
              <>
                {/* 1. Target Channel Selection */}
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5 block">
                    Target Channel / Group <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={assignChannelId}
                    onChange={(e) => setAssignChannelId(e.target.value)}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-medium cursor-pointer"
                  >
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.name} ({ch.group || 'General'}) — ID: {ch.id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Choose previously generated device */}
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5 block">
                    Choose Previously Generated Device <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-emerald-700 dark:text-emerald-400 focus:outline-none focus:border-cyan-500 font-semibold cursor-pointer"
                  >
                    {devices.map((d) => {
                      const c = channels.find((chan) => chan.id === d.channel_id);
                      const locStr = c ? `in: ${c.name}` : 'Standalone / Unassigned';
                      return (
                        <option key={d.device_id} value={d.device_id}>
                          {d.name || d.device_id} ({d.device_id}) — [{locStr}]
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 3. Device Summary Card Preview */}
                {selectedDev && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {selectedDev.name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {selectedDev.device_type || 'ESP32'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span>Current Assignment:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {currentDevChan ? `${currentDevChan.name} (${currentDevChan.group || 'General'})` : 'Standalone (No Channel)'}
                      </span>
                    </div>

                    {isAlreadyInTarget ? (
                      <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] flex items-center gap-1.5 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span>This device is already connected to this channel.</span>
                      </div>
                    ) : selectedDev.channel_id ? (
                      <div className="p-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-[11px] flex items-center gap-1.5 font-medium">
                        <span>Notice: Assigning will move this device from <strong>{currentDevChan?.name || 'its current channel'}</strong> into <strong>{targetChan?.name || 'this channel'}</strong>.</span>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Footer Buttons */}
                <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isAlreadyInTarget || isAssigning || !selectedDeviceId}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm ${
                      isAlreadyInTarget
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 cursor-pointer shadow-cyan-500/20'
                    }`}
                  >
                    {isAssignSuccess ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-950" />
                        <span>Linked Successfully!</span>
                      </>
                    ) : isAssigning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Linking...</span>
                      </>
                    ) : (
                      <>
                        <LinkIcon className="w-4 h-4" />
                        <span>{selectedDev?.channel_id ? 'Move Device to Channel' : 'Assign Device to Channel'}</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </form>
        )}

        {/* TAB 2: REGISTER BRAND NEW DEVICE */}
        {mode === 'new' && (
          <form onSubmit={handleRegisterNew} className="p-6 space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
                Device Identifier (Unique ID)
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={newDeviceId}
                  onChange={(e) => setNewDeviceId(e.target.value)}
                  placeholder="e.g. esp32-dht22-01"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-emerald-700 dark:text-emerald-400 focus:outline-none focus:border-cyan-500 font-medium"
                />
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                MQTT topic: <span className="font-mono text-slate-600 dark:text-slate-400">devices/{newDeviceId || '<id>'}/telemetry</span>
              </p>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
                Device Display Name
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Server Room HVAC Sensor"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-medium"
              />
            </div>

            {channels.length > 0 && (
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
                  Assign to Channel / Group
                </label>
                <select
                  value={newChannelId}
                  onChange={(e) => setNewChannelId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-medium cursor-pointer"
                >
                  <option value="">None (Standalone Sensor)</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name} ({ch.group || 'General'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
                Device / Hardware Type
              </label>
              <select
                value={newDeviceType}
                onChange={(e) => setNewDeviceType(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-medium cursor-pointer"
              >
                <option value="ESP32 + DHT22">ESP32 + DHT22 (Temperature & Humidity)</option>
                <option value="ESP32 + BME280">ESP32 + BME280 (Temp, Humidity, Pressure)</option>
                <option value="Generic Sensor Node">Generic IoT Telemetry Node</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isRegistering}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
              >
                {isRegisterSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Registered!</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Register Device</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
