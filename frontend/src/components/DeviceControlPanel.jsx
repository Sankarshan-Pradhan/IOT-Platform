import React, { useState, useEffect, useCallback } from 'react';
import { 
  Zap, 
  Power, 
  Lightbulb, 
  Clock, 
  RotateCw, 
  Sliders, 
  CheckCircle2, 
  AlertTriangle, 
  Send, 
  Activity, 
  RefreshCw,
  Terminal,
  Key,
  Cpu,
  UploadCloud,
  Copy,
  Check
} from 'lucide-react';
import { 
  sendDeviceCommand, 
  fetchDeviceCommands, 
  regenerateDeviceToken, 
  triggerDeviceOTA 
} from '../api';

export default function DeviceControlPanel({ deviceId, activeDeviceName }) {
  const [relayState, setRelayState] = useState(false);
  const [ledState, setLedState] = useState(false);
  const [samplingInterval, setSamplingInterval] = useState(5000);
  const [commands, setCommands] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRebootModalOpen, setIsRebootModalOpen] = useState(false);
  const [isOtaModalOpen, setIsOtaModalOpen] = useState(false);
  const [targetOtaVersion, setTargetOtaVersion] = useState('v1.1.0');
  const [tokenCopied, setTokenCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Load recent command history for this device
  const loadCommands = useCallback(async () => {
    if (!deviceId) return;
    try {
      const data = await fetchDeviceCommands(deviceId);
      if (Array.isArray(data)) {
        setCommands(data);
      }
    } catch (err) {
      console.warn('[DeviceControl] Error fetching commands:', err);
    }
  }, [deviceId]);

  useEffect(() => {
    loadCommands();
    const interval = setInterval(loadCommands, 4000);
    return () => clearInterval(interval);
  }, [loadCommands]);

  const handleSendCommand = async (action, payload = {}) => {
    if (!deviceId) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await sendDeviceCommand(deviceId, { action, payload });
      setStatusMessage({
        type: 'success',
        text: `Command "${action}" successfully dispatched via MQTT.`,
      });
      await loadCommands();
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Failed to dispatch command: ${err.message}`,
      });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleRelay = () => {
    const nextState = !relayState;
    setRelayState(nextState);
    handleSendCommand('set_relay', { state: nextState, relay_id: 1 });
  };

  const handleToggleLED = () => {
    const nextState = !ledState;
    setLedState(nextState);
    handleSendCommand('toggle_led', { state: nextState });
  };

  const handleApplyInterval = (newMs) => {
    setSamplingInterval(newMs);
    handleSendCommand('set_interval', { interval_ms: newMs });
  };

  const handleTriggerReboot = () => {
    setIsRebootModalOpen(false);
    handleSendCommand('reboot', {});
  };

  const handleCopyToken = () => {
    const dummyToken = `tok_${deviceId}_${Math.random().toString(16).substring(2, 10)}`;
    navigator.clipboard.writeText(dummyToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2500);
  };

  const handleRotateToken = async () => {
    setIsLoading(true);
    try {
      const res = await regenerateDeviceToken(deviceId);
      setStatusMessage({
        type: 'success',
        text: `Security token rotated: ${res.auth_token}`,
      });
      navigator.clipboard.writeText(res.auth_token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 3000);
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Failed to rotate token: ${err.message}`,
      });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDispatchOTA = async () => {
    setIsOtaModalOpen(false);
    setIsLoading(true);
    setStatusMessage(null);
    try {
      await triggerDeviceOTA(deviceId, { version: targetOtaVersion });
      setStatusMessage({
        type: 'success',
        text: `OTA firmware flashing command (${targetOtaVersion}) dispatched to node.`,
      });
      await loadCommands();
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `OTA dispatch failed: ${err.message}`,
      });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  if (!deviceId) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-500">
        <Activity className="w-8 h-8 mx-auto text-slate-400 mb-2" />
        <p className="text-xs">Select an active device to configure downlink controls.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      
      {/* 1. Header Bar */}
      <div className="p-4 sm:px-6 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center font-bold">
            <Zap className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>Device Actuation & Downlink Control</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                MQTT QoS 1
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Target: <strong className="font-semibold text-slate-800">{activeDeviceName || deviceId}</strong> &bull;{' '}
              <span className="font-mono text-[11px] text-slate-400">devices/{deviceId}/commands</span>
            </p>
          </div>
        </div>

        <button
          onClick={loadCommands}
          className="self-start sm:self-auto px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Refresh command log"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div className={`px-4 py-2 text-xs font-medium border-b flex items-center gap-2 ${
          statusMessage.type === 'success'
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
            : 'bg-rose-50 text-rose-900 border-rose-200'
        }`}>
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* 2. Actuation Controls Grid */}
      <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card A: Relay Actuation */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Power className="w-3.5 h-3.5 text-amber-600" />
                Relay Switch 1
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                relayState ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-200 text-slate-600'
              }`}>
                {relayState ? 'ENERGIZED' : 'OPEN'}
              </span>
            </div>
            <h4 className="text-xs font-bold text-slate-800">Power Relay & Solenoid</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Toggle external high-voltage hardware circuit.</p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Relay State</span>
            <button
              onClick={handleToggleRelay}
              disabled={isLoading}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                relayState
                  ? 'bg-rose-500 hover:bg-rose-600 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold'
              }`}
            >
              {relayState ? 'Turn OFF' : 'Turn ON'}
            </button>
          </div>
        </div>

        {/* Card B: Status LED Control */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-cyan-600" />
                Status Indicator LED
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                ledState ? 'bg-cyan-100 text-cyan-800 border border-cyan-300' : 'bg-slate-200 text-slate-600'
              }`}>
                {ledState ? 'LIT' : 'OFF'}
              </span>
            </div>
            <h4 className="text-xs font-bold text-slate-800">ESP32 On-board LED</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Trigger visual LED beacon on hardware node.</p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">LED Output</span>
            <button
              onClick={handleToggleLED}
              disabled={isLoading}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                ledState
                  ? 'bg-slate-700 hover:bg-slate-800 text-white'
                  : 'bg-cyan-500 hover:bg-cyan-600 text-white font-bold'
              }`}
            >
              {ledState ? 'Extinguish' : 'Illuminate'}
            </button>
          </div>
        </div>

        {/* Card C: Sampling Rate & Reboot */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                Telemetry Interval
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                {samplingInterval / 1000}s
              </span>
            </div>
            <h4 className="text-xs font-bold text-slate-800">Dynamic Publishing Rate</h4>
            <div className="flex items-center gap-1.5 mt-2">
              {[1000, 2000, 5000, 10000].map((ms) => (
                <button
                  key={ms}
                  onClick={() => handleApplyInterval(ms)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    samplingInterval === ms
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {ms / 1000}s
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Hardware Reset</span>
            <button
              onClick={() => setIsRebootModalOpen(true)}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCw className="w-3 h-3 text-rose-600" />
              <span>Reboot</span>
            </button>
          </div>
        </div>

        {/* Card D: Edge Security Token & OTA Firmware */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-600" />
                Edge Auth & OTA
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                v1.0.0
              </span>
            </div>
            <h4 className="text-xs font-bold text-slate-800">Token & Firmware Flashing</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Secure per-device token & remote OTA updates.</p>

            <div className="mt-2.5 flex items-center gap-1">
              <button
                onClick={handleCopyToken}
                className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold flex items-center gap-1 transition"
                title="Copy Device Auth Token"
              >
                {tokenCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                <span>{tokenCopied ? 'Copied' : 'Copy Token'}</span>
              </button>

              <button
                onClick={handleRotateToken}
                disabled={isLoading}
                className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold flex items-center gap-1 transition"
                title="Rotate Auth Token"
              >
                <Key className="w-3 h-3 text-amber-600" />
                <span>Rotate</span>
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Remote OTA</span>
            <button
              onClick={() => setIsOtaModalOpen(true)}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <UploadCloud className="w-3 h-3 text-indigo-600" />
              <span>Flash OTA</span>
            </button>
          </div>
        </div>

      </div>

      {/* 3. Downlink Command Audit History */}
      <div className="border-t border-slate-200 p-4 sm:px-6 bg-slate-50/30">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Terminal className="w-4 h-4 text-slate-500" />
            Downlink Command Dispatch Log (Recent 10)
          </span>
          <span className="text-[10px] font-mono text-slate-400">
            ACK topic: devices/{deviceId}/command_ack
          </span>
        </div>

        {commands.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
            No downlink commands dispatched to this device yet. Use the controls above to trigger hardware actions.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-200">
                  <th className="py-2 px-3">Command ID</th>
                  <th className="py-2 px-3">Action</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Hardware Response</th>
                  <th className="py-2 px-3 text-right">Dispatched At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {commands.slice(0, 10).map((cmd) => {
                  const isAck = cmd.status === 'ACKNOWLEDGED';
                  return (
                    <tr key={cmd.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-600">{cmd.id}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          {cmd.action}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isAck 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isAck ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                          {cmd.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-600 truncate max-w-[200px]">
                        {cmd.response || 'Awaiting device response...'}
                      </td>
                      <td className="py-2 px-3 text-right text-[11px] text-slate-400 font-mono">
                        {new Date(cmd.sent_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reboot Confirm Modal */}
      {isRebootModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6" />
              <h4 className="text-sm font-bold text-slate-900">Confirm Remote Reboot</h4>
            </div>
            <p className="text-xs text-slate-600">
              This will dispatch an immediate hardware restart command to node <strong className="font-bold text-slate-900">{deviceId}</strong>. The device will momentarily drop offline while rebooting.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsRebootModalOpen(false)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleTriggerReboot}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm"
              >
                Yes, Reboot Node
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OTA Firmware Flashing Modal */}
      {isOtaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-3 text-indigo-600">
              <UploadCloud className="w-6 h-6" />
              <h4 className="text-sm font-bold text-slate-900">Over-the-Air Firmware Flash</h4>
            </div>
            <p className="text-xs text-slate-600">
              Dispatch an automated OTA firmware upgrade to ESP32 node <strong className="font-bold text-slate-900">{deviceId}</strong>.
            </p>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Target Firmware Version</label>
              <input
                type="text"
                value={targetOtaVersion}
                onChange={(e) => setTargetOtaVersion(e.target.value)}
                placeholder="e.g. v1.1.0"
                className="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsOtaModalOpen(false)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleDispatchOTA}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Dispatch OTA Flash</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}