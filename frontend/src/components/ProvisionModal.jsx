import React, { useState, useEffect } from 'react';
import { 
  Key, 
  X, 
  Copy, 
  Check, 
  Sparkles, 
  ShieldCheck, 
  Cpu, 
  Hash, 
  Layers, 
  FileCode, 
  CheckCircle2 
} from 'lucide-react';
import { generateUUID, generateChannelId, generateSecretKey, generateConfigCode } from '../utils/generators';

export default function ProvisionModal({
  isOpen,
  onClose,
  activeTenantId,
  onDeviceRegistered,
}) {
  const [tenantId, setTenantId] = useState(activeTenantId || 'a0000000-0000-0000-0000-000000000001');
  const [deviceId, setDeviceId] = useState('esp32-dht22-01');
  const [channelId, setChannelId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [brokerHost, setBrokerHost] = useState('192.168.1.100');
  const [wifiSsid, setWifiSsid] = useState('YOUR_WIFI_SSID');

  const [copiedField, setCopiedField] = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (!channelId) setChannelId(generateChannelId('dht22'));
      if (!secretKey) setSecretKey(generateSecretKey());
      if (activeTenantId) setTenantId(activeTenantId);
      setIsSaved(false);
    }
  }, [isOpen, activeTenantId]);

  if (!isOpen) return null;

  const handleRegenerateAll = () => {
    setTenantId(generateUUID());
    setChannelId(generateChannelId('dht22'));
    setSecretKey(generateSecretKey());
    setIsSaved(false);
  };

  const handleCopy = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const configCode = generateConfigCode({
    tenantId,
    channelId,
    deviceId,
    secretKey,
    brokerHost,
    wifiSsid,
  });

  const handleCopyCode = () => {
    navigator.clipboard.writeText(configCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2500);
  };

  const handleSaveDevice = () => {
    if (onDeviceRegistered) {
      onDeviceRegistered({
        device_id: deviceId,
        tenant_id: tenantId,
        channel_id: channelId,
        secret_key: secretKey,
        name: `${deviceId.toUpperCase()} (DHT22 Node)`,
        device_type: 'ESP32',
        status: 'online',
      });
    }
    setIsSaved(true);
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Provision ESP32 & Generate Credentials
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Generate secure Channel ID, Tenant ID, and Secret Auth Key for firmware
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

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          
          {/* Quick Regenerate Bar */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <span>Generate new cryptographic tokens:</span>
            </div>
            <button
              onClick={handleRegenerateAll}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition shadow-sm"
            >
              Generate New Keys
            </button>
          </div>

          {/* Form Credentials */}
          <div className="space-y-3">
            
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
                  placeholder="e.g. esp32-dht22-01"
                />
                <button
                  onClick={() => handleCopy(deviceId, 'deviceId')}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-mono flex items-center gap-1 transition"
                >
                  {copiedField === 'deviceId' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy
                </button>
              </div>
            </div>

            {/* Tenant ID */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-500" />
                Tenant ID (UUID)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-emerald-700 dark:text-emerald-300 font-semibold focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={() => handleCopy(tenantId, 'tenantId')}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-mono flex items-center gap-1 transition"
                >
                  {copiedField === 'tenantId' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy
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
                  className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-cyan-700 dark:text-cyan-300 font-semibold focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={() => handleCopy(channelId, 'channelId')}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-mono flex items-center gap-1 transition"
                >
                  {copiedField === 'channelId' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy
                </button>
              </div>
            </div>

            {/* Secret Key */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                Secret Key (Client Auth Token)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={secretKey}
                  readOnly
                  className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-amber-700 dark:text-amber-300 font-semibold focus:outline-none select-all"
                />
                <button
                  onClick={() => handleCopy(secretKey, 'secretKey')}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-mono flex items-center gap-1 transition"
                >
                  {copiedField === 'secretKey' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy
                </button>
              </div>
            </div>

          </div>

          {/* C++ Code Preview */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                Firmware Header: <code className="text-emerald-400">config.h</code>
              </span>
              <button
                onClick={handleCopyCode}
                className="text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
              >
                {codeCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
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

            <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto p-3 rounded-lg bg-slate-900 border border-slate-800/80 max-h-36">
              {configCode}
            </pre>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between">
          <p className="text-[11px] text-slate-500">
            Paste credentials directly into <code className="text-slate-700 dark:text-slate-300 font-mono">config.h</code>
          </p>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveDevice}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
            >
              {isSaved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-slate-950" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  <span>Save & Provision</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
