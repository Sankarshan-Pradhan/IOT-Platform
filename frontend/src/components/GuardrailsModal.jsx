import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  X, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  BellRing, 
  Trash2, 
  Sliders, 
  Check, 
  Activity,
  Flame,
  Droplets,
  Send,
  Webhook,
  Radio,
  RefreshCw
} from 'lucide-react';
import { 
  fetchNotificationChannels, 
  createNotificationChannel, 
  deleteNotificationChannel, 
  testNotificationChannel 
} from '../api';

export default function GuardrailsModal({
  isOpen,
  onClose,
  alarms = [],
  rules = [],
  onAcknowledgeAlarm,
  onResolveAlarm,
  onDeleteAlarm,
  onCreateRule,
  onDeleteRule,
  activeTenantId,
  isAdmin = false,
}) {
  const [activeTab, setActiveTab] = useState('alarms'); // 'alarms', 'rules', or 'channels'
  const [statusFilter, setStatusFilter] = useState('ALL');

  // New Rule form state
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleField, setNewRuleField] = useState('temperature_c');
  const [newRuleOp, setNewRuleOp] = useState('>');
  const [newRuleThreshold, setNewRuleThreshold] = useState('35.0');
  const [newRuleSeverity, setNewRuleSeverity] = useState('CRITICAL');

  // Alert Channels state
  const [notificationChannels, setNotificationChannels] = useState([]);
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [chName, setChName] = useState('');
  const [chType, setChType] = useState('discord');
  const [chUrl, setChUrl] = useState('');
  const [chSeverity, setChSeverity] = useState('CRITICAL');
  const [testStatus, setTestStatus] = useState(null);

  // Load alert channels on modal open
  useEffect(() => {
    if (isOpen) {
      fetchNotificationChannels(activeTenantId).then((data) => {
        if (Array.isArray(data)) setNotificationChannels(data);
      });
    }
  }, [isOpen, activeTenantId]);

  const handleAddChannelSubmit = async (e) => {
    e.preventDefault();
    if (!chName.trim() || !chUrl.trim()) return;

    try {
      const created = await createNotificationChannel({
        tenant_id: activeTenantId,
        name: chName.trim(),
        type: chType,
        target_url: chUrl.trim(),
        severity: chSeverity,
      });
      setNotificationChannels((prev) => [...prev, created.channel]);
      setChName('');
      setChUrl('');
      setIsAddingChannel(false);
    } catch (err) {
      alert(`Could not create alert channel: ${err.message}`);
    }
  };

  const handleDeleteChannel = async (id) => {
    try {
      await deleteNotificationChannel(id);
      setNotificationChannels((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert(`Could not delete alert channel: ${err.message}`);
    }
  };

  const handleTestChannel = async (url, type) => {
    setTestStatus('Sending test alert...');
    try {
      await testNotificationChannel(url, type);
      setTestStatus('Test alert dispatched successfully!');
      setTimeout(() => setTestStatus(null), 4000);
    } catch (err) {
      setTestStatus(`Test failed: ${err.message}`);
      setTimeout(() => setTestStatus(null), 5000);
    }
  };

  if (!isOpen) return null;

  const openAlarmsCount = alarms.filter((a) => a.status === 'OPEN').length;

  const filteredAlarms = statusFilter === 'ALL'
    ? alarms
    : alarms.filter((a) => a.status === statusFilter);

  const handleAddRuleSubmit = async (e) => {
    e.preventDefault();
    if (!newRuleName.trim() || !newRuleThreshold) return;

    if (onCreateRule) {
      await onCreateRule({
        tenant_id: activeTenantId || 'a0000000-0000-0000-0000-000000000001',
        name: newRuleName.trim(),
        field: newRuleField,
        operator: newRuleOp,
        threshold: parseFloat(newRuleThreshold),
        severity: newRuleSeverity,
        enabled: true,
      });
    }

    setNewRuleName('');
    setNewRuleThreshold('35.0');
    setIsAddingRule(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] transition-colors duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl border ${
              openAlarmsCount > 0
                ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/25 animate-pulse'
                : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25'
            }`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Guardrails & Threshold Alarms</span>
                {openAlarmsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500 text-white animate-bounce">
                    {openAlarmsCount} OPEN
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Automated threshold violation checks and safety policies
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

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-6 pt-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('alarms')}
              className={`pb-2.5 font-bold transition border-b-2 flex items-center gap-1.5 ${
                activeTab === 'alarms'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>Triggered Alarms</span>
              {openAlarmsCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('rules')}
              className={`pb-2.5 font-bold transition border-b-2 flex items-center gap-1.5 ${
                activeTab === 'rules'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Threshold Rules ({rules.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('channels')}
              className={`pb-2.5 font-bold transition border-b-2 flex items-center gap-1.5 ${
                activeTab === 'channels'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Alert Channels ({notificationChannels.length})</span>
            </button>
          </div>

          {activeTab === 'alarms' && (
            <div className="flex items-center gap-1 pb-2">
              {['ALL', 'OPEN', 'RESOLVED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                    statusFilter === st
                      ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'rules' && !isAdmin && (
            <button
              onClick={() => setIsAddingRule(!isAddingRule)}
              className="pb-2 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAddingRule ? 'Cancel' : 'Add Rule'}</span>
            </button>
          )}

          {activeTab === 'channels' && (
            <button
              onClick={() => setIsAddingChannel(!isAddingChannel)}
              className="pb-2 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAddingChannel ? 'Cancel' : 'Add Channel'}</span>
            </button>
          )}
        </div>

        {/* Tab 1: Alarms Content */}
        {activeTab === 'alarms' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {filteredAlarms.length === 0 ? (
              <div className="py-12 text-center flex flex-col items-center justify-center space-y-2">
                <div className="p-3 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-white">All Guardrails Nominal</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                  {statusFilter === 'ALL'
                    ? 'No guardrail violations recorded. Temperature and humidity metrics remain within configured limits.'
                    : `No alarms currently with status "${statusFilter}".`}
                </p>
              </div>
            ) : (
              filteredAlarms.map((alarm) => {
                const isOpen = alarm.status === 'OPEN';
                const isAck = alarm.status === 'ACKNOWLEDGED';
                const isResolved = alarm.status === 'RESOLVED';

                return (
                  <div
                    key={alarm.id}
                    className={`rounded-xl p-4 border transition-all text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                      isOpen
                        ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-500/40'
                        : isAck
                        ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-500/40'
                        : 'bg-slate-50/70 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-80'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isOpen
                            ? 'bg-rose-500 text-white animate-pulse'
                            : isAck
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          {alarm.status}
                        </span>

                        <span className="font-bold text-slate-800 dark:text-white">
                          {alarm.rule_name || 'Guardrail Threshold Alert'}
                        </span>

                        <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                          [{alarm.device_id}]
                        </span>
                      </div>

                      <p className="text-slate-600 dark:text-slate-300 font-medium">
                        {alarm.message}
                      </p>

                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        <span>Triggered: {new Date(alarm.triggered_at).toLocaleTimeString()}</span>
                        {alarm.resolved_at && (
                          <span>Resolved: {new Date(alarm.resolved_at).toLocaleTimeString()}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {isOpen && onAcknowledgeAlarm && (
                        <button
                          onClick={() => onAcknowledgeAlarm(alarm.id)}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition text-[11px]"
                        >
                          Acknowledge
                        </button>
                      )}

                      {!isResolved && onResolveAlarm && (
                        <button
                          onClick={() => onResolveAlarm(alarm.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition text-[11px]"
                        >
                          Resolve
                        </button>
                      )}

                      {onDeleteAlarm && (
                        <button
                          onClick={() => onDeleteAlarm(alarm.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 transition"
                          title="Delete Alarm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Rules Content */}
        {activeTab === 'rules' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            
            {/* Add Rule Form */}
            {isAddingRule && (
              <form onSubmit={handleAddRuleSubmit} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 space-y-3 text-xs">
                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Configure Dynamic Threshold Guardrail</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Rule Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Critical Server Overheat"
                      value={newRuleName}
                      onChange={(e) => setNewRuleName(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Telemetry Field</label>
                    <select
                      value={newRuleField}
                      onChange={(e) => setNewRuleField(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white"
                    >
                      <option value="temperature_c">temperature_c (°C)</option>
                      <option value="humidity_pct">humidity_pct (% RH)</option>
                      <option value="wifi_rssi">wifi_rssi (dBm)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Comparison Operator</label>
                    <select
                      value={newRuleOp}
                      onChange={(e) => setNewRuleOp(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white"
                    >
                      <option value=">">Greater than (&gt;)</option>
                      <option value=">=">Greater than or equal (&gt;=)</option>
                      <option value="<">Less than (&lt;)</option>
                      <option value="<=">Less than or equal (&lt;=)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Threshold Value</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={newRuleThreshold}
                      onChange={(e) => setNewRuleThreshold(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingRule(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Save Guardrail Rule</span>
                  </button>
                </div>
              </form>
            )}

            {/* Rules List */}
            <div className="space-y-2.5">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between text-xs shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">{r.name}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                        {r.severity || 'CRITICAL'}
                      </span>
                    </div>

                    <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                      {r.description || 'Threshold rule check'}
                    </p>

                    <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                      <span>Condition:</span>
                      <strong className="bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        {r.field} {r.operator} {r.threshold}
                      </strong>
                    </div>
                  </div>

                  {!isAdmin && onDeleteRule && (
                    <button
                      onClick={() => onDeleteRule(r.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 transition"
                      title="Delete Rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

          </div>
        )}

        {/* Tab 3: Alert Channels Content */}
        {activeTab === 'channels' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {testStatus && (
              <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between border ${
                testStatus.includes('failed')
                  ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                  : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
              }`}>
                <span>{testStatus}</span>
                <button onClick={() => setTestStatus(null)} className="text-[10px] underline ml-2">Dismiss</button>
              </div>
            )}

            {/* Add Channel Form */}
            {isAddingChannel && (
              <form onSubmit={handleAddChannelSubmit} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 space-y-3 text-xs">
                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Webhook className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Register Outbound Alert Webhook</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Channel Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. #ops-alarms Slack or Discord"
                      value={chName}
                      onChange={(e) => setChName(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Channel Platform</label>
                    <select
                      value={chType}
                      onChange={(e) => setChType(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white"
                    >
                      <option value="discord">Discord Webhook</option>
                      <option value="slack">Slack Incoming Webhook</option>
                      <option value="webhook">Generic HTTP POST Webhook</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Target Webhook URL</label>
                    <input
                      type="url"
                      required
                      placeholder="https://discord.com/api/webhooks/... or https://hooks.slack.com/services/..."
                      value={chUrl}
                      onChange={(e) => setChUrl(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white font-mono text-[11px]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Severity Trigger</label>
                    <select
                      value={chSeverity}
                      onChange={(e) => setChSeverity(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white"
                    >
                      <option value="CRITICAL">CRITICAL Alarms Only (Recommended)</option>
                      <option value="ALL">All Alarms (CRITICAL, WARNING, INFO)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingChannel(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Save Alert Channel</span>
                  </button>
                </div>
              </form>
            )}

            {/* Channels List */}
            <div className="space-y-2.5">
              {notificationChannels.length === 0 ? (
                <div className="py-10 text-center flex flex-col items-center justify-center space-y-2">
                  <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
                    <Radio className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white">No Notification Channels</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                    Configure Discord, Slack, or generic HTTP Webhooks to automatically notify engineers when critical threshold alarms trigger.
                  </p>
                </div>
              ) : (
                notificationChannels.map((ch) => (
                  <div
                    key={ch.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-sm"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{ch.name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          {ch.type}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          {ch.severity || 'CRITICAL'}
                        </span>
                      </div>

                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-md">
                        {ch.target_url}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => handleTestChannel(ch.target_url, ch.type)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold transition text-[11px] flex items-center gap-1"
                        title="Dispatch test notification"
                      >
                        <Send className="w-3 h-3 text-emerald-500" />
                        <span>Test Ping</span>
                      </button>

                      <button
                        onClick={() => handleDeleteChannel(ch.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 transition"
                        title="Delete Channel"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
