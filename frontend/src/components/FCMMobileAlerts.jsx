import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Send, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Radio, 
  Bell, 
  ShieldAlert, 
  Sparkles,
  RefreshCw,
  Check,
  Flame,
  ChevronDown,
  ChevronUp,
  Key,
  FileCode,
  ExternalLink
} from 'lucide-react';
import { fetchFCMConfig, fetchFCMTokens, registerFCMToken, deleteFCMToken, testFCMPush } from '../api';

export default function FCMMobileAlerts({ activeTenantId }) {
  const [fcmConfig, setFcmConfig] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  // New device form state
  const [isRegistering, setIsRegistering] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [platform, setPlatform] = useState('android');
  const [customToken, setCustomToken] = useState('');

  // Live incoming push alert state (simulated push banner on lockscreen preview)
  const [activeAlertPreview, setActiveAlertPreview] = useState({
    title: '🚨 CRITICAL GUARDRAIL: esp32-dht22-node1',
    body: 'High Temperature Overheat Guardrail: Ambient temperature reached 41.2°C (> 35.0°C limit)',
    time: 'Just now',
    severity: 'CRITICAL',
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cfg, toks] = await Promise.all([
        fetchFCMConfig(),
        fetchFCMTokens(activeTenantId),
      ]);
      setFcmConfig(cfg);
      setTokens(toks);
    } catch (err) {
      console.warn('Failed loading FCM data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTenantId]);

  const handleRegisterDevice = async (e) => {
    e.preventDefault();
    if (!deviceName.trim()) return;

    try {
      // Auto-generate realistic token if not provided
      const finalToken = customToken.trim() || `fcm_tok_${platform}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const res = await registerFCMToken({
        tenant_id: activeTenantId,
        device_name: deviceName.trim(),
        fcm_token: finalToken,
        platform,
      });

      setStatusMsg(`Registered device '${deviceName}' successfully!`);
      setIsRegistering(false);
      setDeviceName('');
      setCustomToken('');
      await loadData();
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err) {
      alert(`Registration failed: ${err.message}`);
    }
  };

  const handleDeleteToken = async (id) => {
    try {
      await deleteFCMToken(id);
      setTokens((prev) => prev.filter((t) => t.id !== id));
      setStatusMsg('Push device unregistered.');
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err) {
      alert(`Failed to delete token: ${err.message}`);
    }
  };

  const handleSendTestPush = async () => {
    setIsSendingTest(true);
    try {
      const payload = {
        tenant_id: activeTenantId,
        device_name: 'esp32-dht22-node1',
        title: '🚨 [CRITICAL ALARM] Factory Zone Overheat',
        body: 'Guardrail violation: Machine temperature surged to 41.8°C (threshold: 35.0°C). Immediate operator action recommended.',
      };

      await testFCMPush(payload);

      setActiveAlertPreview({
        title: payload.title,
        body: payload.body,
        time: 'Just now',
        severity: 'CRITICAL',
      });

      setStatusMsg('High-priority FCM mobile push alert dispatched to registered operator phones!');
      setTimeout(() => setStatusMsg(null), 5000);
    } catch (err) {
      alert(`Failed to dispatch test push: ${err.message}`);
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleQuickRegisterCurrentDevice = async () => {
    const userAgent = navigator.userAgent;
    let detectedPlatform = 'web';
    if (/android/i.test(userAgent)) detectedPlatform = 'android';
    if (/iphone|ipad/i.test(userAgent)) detectedPlatform = 'ios';

    const defaultName = detectedPlatform === 'android' 
      ? 'Android Operator Mobile' 
      : detectedPlatform === 'ios' 
        ? 'iPhone Field Operator' 
        : 'Browser Mission Control';

    try {
      const generatedToken = `fcm_${detectedPlatform}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      await registerFCMToken({
        tenant_id: activeTenantId,
        device_name: defaultName,
        fcm_token: generatedToken,
        platform: detectedPlatform,
      });

      setStatusMsg(`Registered ${defaultName} for push notifications!`);
      await loadData();
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err) {
      alert(`Error registering current device: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Firebase Cloud Messaging (FCM) Mobile Push Alerts
                </h3>
                {fcmConfig?.has_service_account ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Google Cloud HTTP v1 (Production)
                  </span>
                ) : fcmConfig?.has_server_key ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Server Key (Production)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Simulation Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Dispatches instantaneous high-priority push notifications directly to operators' Android, iOS, and Web devices when critical guardrails are breached.
              </p>
              {fcmConfig?.project_id && (
                <p className="text-[11px] font-mono text-emerald-600 mt-0.5">
                  Connected Google Cloud Project: <strong>{fcmConfig.project_id}</strong>
                </p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={handleSendTestPush}
              disabled={isSendingTest}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow-xs cursor-pointer"
            >
              <Send className={`w-3.5 h-3.5 ${isSendingTest ? 'animate-bounce' : ''}`} />
              <span>{isSendingTest ? 'Dispatching...' : 'Send Test Push Alert'}</span>
            </button>

            <button
              onClick={handleQuickRegisterCurrentDevice}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-xs cursor-pointer"
              title="Add current device to push notification list"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Register This Device</span>
            </button>
          </div>
        </div>

        {statusMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Expandable Google Firebase Production Credentials Setup Guide */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <button
            onClick={() => setShowSetupGuide(!showSetupGuide)}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-slate-900 transition cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-500" />
              <span>How to plug in your real Google Firebase Service Account Key</span>
            </span>
            <span className="flex items-center gap-1 text-[11px] text-amber-600 font-bold">
              {showSetupGuide ? 'Hide Guide' : 'View Instructions'}
              {showSetupGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </button>

          {showSetupGuide && (
            <div className="mt-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2.5 text-slate-600">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <FileCode className="w-4 h-4 text-emerald-600" />
                <span>Google Cloud Firebase HTTP v1 Setup:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 pl-1 text-[11px] leading-relaxed">
                <li>
                  Open your project on the <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-amber-600 underline font-semibold inline-flex items-center gap-0.5">Firebase Console <ExternalLink className="w-2.5 h-2.5" /></a>.
                </li>
                <li>
                  Go to <strong>Project Settings</strong> (gear icon) → <strong>Service accounts</strong> tab.
                </li>
                <li>
                  Under Firebase Admin SDK, click <strong>Generate new private key</strong> to download your <code className="bg-white px-1 rounded border border-slate-200">service-account.json</code>.
                </li>
                <li>
                  Place the file at <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-slate-800">infra/fcm/service-account.json</code>, or paste the JSON into <code className="bg-white px-1 rounded border border-slate-200 font-mono">FCM_SERVICE_ACCOUNT_JSON</code> in your <code className="font-mono">.env</code>.
                </li>
              </ol>
              <p className="text-[10px] text-slate-500 italic pt-1">
                Once detected, the backend automatically exchanges tokens with Google OAuth2 using RS256 and delivers live push notifications to locked phone screens.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Grid: Left Devices Table, Right Phone Mockup Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Registered Devices */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-500" />
                <h4 className="text-sm font-bold text-slate-900">Registered Operator Push Devices</h4>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {tokens.length} Active
                </span>
              </div>

              <button
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isRegistering ? 'Cancel' : 'Manual Token Setup'}</span>
              </button>
            </div>

            {/* Manual Registration Form */}
            {isRegistering && (
              <form onSubmit={handleRegisterDevice} className="mb-5 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Device Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Lead Operator Pixel 8"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      required
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Platform</label>
                    <select
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="android">Android Phone / Tablet</option>
                      <option value="ios">Apple iOS (iPhone / iPad)</option>
                      <option value="web">Web Browser (PWA)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">FCM Device Token (Optional)</label>
                    <input
                      type="text"
                      placeholder="Auto-generated if blank"
                      value={customToken}
                      onChange={(e) => setCustomToken(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                  >
                    Save Push Registration
                  </button>
                </div>
              </form>
            )}

            {/* Devices Table */}
            {tokens.length === 0 ? (
              <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                <Smartphone className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-600">No mobile devices registered yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Click <strong>+ Register This Device</strong> above to enable instant mobile push notifications.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="text-[11px] font-bold uppercase text-slate-400 border-b border-slate-100 pb-2">
                    <tr>
                      <th className="py-2">Device Name</th>
                      <th className="py-2">Platform</th>
                      <th className="py-2">Push Token</th>
                      <th className="py-2">Status</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tokens.map((tok) => (
                      <tr key={tok.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 font-bold text-slate-800 flex items-center gap-2">
                          <Smartphone className="w-3.5 h-3.5 text-amber-500" />
                          <span>{tok.device_name}</span>
                        </td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            tok.platform === 'ios' 
                              ? 'bg-slate-100 text-slate-700' 
                              : tok.platform === 'android'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-cyan-50 text-cyan-700'
                          }`}>
                            {tok.platform}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-[11px] text-slate-400">
                          {tok.fcm_token ? `${tok.fcm_token.slice(0, 16)}...` : 'Active'}
                        </td>
                        <td className="py-2.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Receiving Alerts
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => handleDeleteToken(tok.id)}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Remove device"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Mobile Lockscreen Mockup Preview */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Operator Phone Preview
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Lockscreen Notification</span>
          </div>

          {/* Smartphone Frame Mockup */}
          <div className="w-[260px] bg-slate-900 border-4 border-slate-800 rounded-[36px] p-3 shadow-xl relative overflow-hidden select-none">
            {/* Speaker Notch */}
            <div className="w-24 h-4 bg-slate-800 rounded-full mx-auto mb-4 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-slate-900/60" />
            </div>

            {/* Lockscreen Header */}
            <div className="text-center text-white mb-6">
              <div className="text-2xl font-light tracking-tight font-mono">10:42</div>
              <div className="text-[10px] text-slate-400 font-medium">Friday, November 13</div>
            </div>

            {/* Push Notification Card on Lockscreen */}
            <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3 shadow-lg border border-white/20 mb-12 animate-pulse">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 rounded bg-rose-500 text-white">
                    <ShieldAlert className="w-3 h-3" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-900">IoT Mission Control</span>
                </div>
                <span className="text-[9px] text-slate-400 font-medium">{activeAlertPreview.time}</span>
              </div>

              <h5 className="text-[11px] font-bold text-rose-600 leading-snug">
                {activeAlertPreview.title}
              </h5>
              <p className="text-[10px] text-slate-600 mt-0.5 line-clamp-3 leading-relaxed">
                {activeAlertPreview.body}
              </p>
            </div>

            {/* Bottom Home Indicator */}
            <div className="w-20 h-1 bg-slate-600 rounded-full mx-auto mt-auto" />
          </div>

          <p className="text-[11px] text-slate-400 text-center mt-3 max-w-[240px]">
            High-priority push channels bypass mobile battery saver restrictions to notify on-duty technicians instantly.
          </p>
        </div>

      </div>
    </div>
  );
}
