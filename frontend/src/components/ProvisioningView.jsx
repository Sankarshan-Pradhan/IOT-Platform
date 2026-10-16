import React, { useState } from 'react';
import { 
  Key, 
  Sparkles, 
  Copy, 
  Check, 
  FileCode, 
  Cpu, 
  Layers, 
  Hash, 
  ShieldCheck,
  CheckCircle2,
  Terminal
} from 'lucide-react';
import { generateUUID, generateChannelId, generateSecretKey, generateConfigCode } from '../utils/generators';

export default function ProvisioningView({
  tenants,
  activeTenant,
  channels,
  devices,
  onDeviceRegistered,
}) {
  const [tenantId, setTenantId] = useState(activeTenant?.id || 'a0000000-0000-0000-0000-000000000001');
  const [deviceId, setDeviceId] = useState('esp32-dht22-01');
  const [channelId, setChannelId] = useState(channels[0]?.id || 'chan-dht22-8f2a');
  const [secretKey, setSecretKey] = useState('iot_sec_a8f921d70e4bc11e3381a029302e1b4c');
  const [brokerHost, setBrokerHost] = useState('192.168.1.100');
  const [brokerPort, setBrokerPort] = useState(1883);
  const [wifiSsid, setWifiSsid] = useState('Your_Home_WiFi');
  const [wifiPassword, setWifiPassword] = useState('Your_WiFi_Password');

  const [copiedField, setCopiedField] = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleGenerateFresh = () => {
    setChannelId(generateChannelId('dht22'));
    setSecretKey(generateSecretKey());
    setSavedSuccess(false);
  };

  const handleCopy = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const configCode = generateConfigCode({
    tenantId,
    channelId,
    deviceId,
    secretKey,
    brokerHost,
    brokerPort,
    wifiSsid,
    wifiPassword,
  });

  const handleCopyCode = () => {
    navigator.clipboard.writeText(configCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2500);
  };

  const handleSaveToInventory = () => {
    if (onDeviceRegistered) {
      onDeviceRegistered({
        device_id: deviceId,
        tenant_id: tenantId,
        channel_id: channelId,
        secret_key: secretKey,
        name: `${deviceId.toUpperCase()} (DHT22)`,
        device_type: 'ESP32',
        status: 'online',
      });
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Key className="w-6 h-6 text-amber-500" />
            <span>ESP32 Provisioning & Key Generator</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Generate and copy cryptographic Tenant IDs, Channel IDs, and Secret Keys to flash your ESP32.
          </p>
        </div>

        <button
          onClick={handleGenerateFresh}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-md shadow-amber-500/20"
        >
          <Sparkles className="w-4 h-4" />
          <span>Generate New Keys</span>
        </button>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Key Parameters & Form */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm dark:shadow-xl">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Edge Credentials</span>
            </h3>

            {/* Tenant Selection */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-500" />
                Target Workspace
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-emerald-700 dark:text-emerald-300 focus:outline-none focus:border-emerald-500"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleCopy(tenantId, 'tenant')}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-mono flex items-center gap-1 transition"
                  title="Copy Tenant ID"
                >
                  {copiedField === 'tenant' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Device ID */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-500" />
                Device ID
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={() => handleCopy(deviceId, 'device')}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-mono flex items-center gap-1 transition"
                >
                  {copiedField === 'device' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Channel ID */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                <Hash className="w-3.5 h-3.5 text-cyan-500" />
                Channel ID
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-cyan-700 dark:text-cyan-300 focus:outline-none focus:border-cyan-500 font-semibold"
                />
                <button
                  onClick={() => handleCopy(channelId, 'channel')}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-mono flex items-center gap-1 transition"
                >
                  {copiedField === 'channel' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Secret Key */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                <Key className="w-3.5 h-3.5 text-amber-500" />
                Secret Key (Auth Token)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={secretKey}
                  className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-amber-600 dark:text-amber-300 focus:outline-none select-all font-semibold"
                />
                <button
                  onClick={() => handleCopy(secretKey, 'secret')}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-mono flex items-center gap-1 transition"
                >
                  {copiedField === 'secret' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* WiFi & Broker Settings */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
              <span className="text-[11px] font-bold uppercase text-slate-400 dark:text-slate-500 block">
                Network & Broker Target
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px]">Broker Host IP</span>
                  <input
                    type="text"
                    value={brokerHost}
                    onChange={(e) => setBrokerHost(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-white mt-1"
                  />
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px]">WiFi SSID</span>
                  <input
                    type="text"
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-white mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveToInventory}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition shadow-md shadow-emerald-500/20"
            >
              {savedSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-slate-950" />
                  <span>Device Saved to Inventory!</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  <span>Register Device & Keys</span>
                </>
              )}
            </button>

          </div>
        </div>

        {/* Right Column: Copyable C++ config.h code */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm dark:shadow-xl flex flex-col h-full">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Generated ESP32 Firmware Header</h3>
              </div>

              <button
                onClick={handleCopyCode}
                className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 text-xs font-mono font-semibold flex items-center gap-1.5 transition"
              >
                {codeCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy config.h</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 mb-2">
              Save this into <code className="text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-950 px-1 py-0.5 rounded font-mono">firmware/esp32-dht22/include/config.h</code> and flash your ESP32:
            </p>

            <pre className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 text-[11px] font-mono text-slate-200 overflow-x-auto leading-relaxed select-all">
              {configCode}
            </pre>

            <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400">
              <Terminal className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>
                To flash after saving: <code className="text-emerald-600 dark:text-emerald-400 font-mono font-semibold">pio run --target upload</code>
              </span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
