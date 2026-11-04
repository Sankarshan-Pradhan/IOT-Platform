import React, { useState, useEffect } from 'react';
import { Cpu, X, Plus, Radio, Layers, CheckCircle2 } from 'lucide-react';

export default function AddDeviceModal({
  isOpen,
  onClose,
  activeTenantId,
  channels = [],
  onDeviceRegistered,
}) {
  const [deviceId, setDeviceId] = useState('');
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState('');
  const [deviceType, setDeviceType] = useState('ESP32 + DHT22');
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const randomSuffix = Math.floor(10 + Math.random() * 90);
      setDeviceId(`esp32-sensor-${randomSuffix}`);
      setName(`Sensor Node ${randomSuffix}`);
      setChannelId(channels[0]?.id || 'chan-dht22-alpha');
      setDeviceType('ESP32 + DHT22');
      setIsSuccess(false);
    }
  }, [isOpen, channels]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!deviceId.trim() || !name.trim()) return;

    if (onDeviceRegistered) {
      onDeviceRegistered({
        device_id: deviceId.trim().toLowerCase().replace(/\s+/g, '-'),
        tenant_id: activeTenantId || 'a0000000-0000-0000-0000-000000000001',
        channel_id: channelId,
        name: name.trim(),
        device_type: deviceType,
        status: 'online',
        created_at: new Date().toISOString(),
      });
    }

    setIsSuccess(true);
    setTimeout(() => {
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-colors duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Register New Sensor Device</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Add an edge sensor to start streaming telemetry</p>
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
              Device Identifier (Unique ID)
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="e.g. esp32-dht22-01"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-emerald-700 dark:text-emerald-400 focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              MQTT topic: <span className="font-mono text-slate-600 dark:text-slate-400">devices/{deviceId || '<id>'}/telemetry</span>
            </p>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
              Device Display Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Server Room HVAC Sensor"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
            />
          </div>

          {channels.length > 0 && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
                Assign to Channel / Group
              </label>
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium cursor-pointer"
              >
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
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium cursor-pointer"
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
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
            >
              {isSuccess ? (
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

      </div>
    </div>
  );
}
