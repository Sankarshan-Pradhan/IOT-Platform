import React from 'react';
import { 
  Activity, 
  RefreshCw, 
  Database, 
  Server, 
  Play, 
  Pause, 
  Thermometer, 
  Shield,
  ShieldAlert,
  HardDrive
} from 'lucide-react';

export default function Header({
  health,
  isPolling,
  setIsPolling,
  countdown,
  onManualRefresh,
  isRefreshing,
  tempUnit,
  setTempUnit,
  lastPolledAt,
  activeTenant,
  openAlarmsCount = 0,
  onOpenGuardrailsModal,
  currentUser,
  onOpenLoginModal,
  onLogout,
  isSSEConnected = false,
  telemetryStats = null,
  onPruneTelemetry = null,
  isPruning = false,
}) {
  const isBackendOk = health && health.status === 'ok';
  const isDbOk = health && health.database === 'connected';

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3 transition-colors duration-200">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        
        {/* Brand & Active Workspace */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-md shadow-emerald-500/20 text-slate-950 font-bold">
            <Activity className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                IoT Platform
              </h1>
              {isSSEConnected ? (
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Live SSE (0ms)
                </span>
              ) : (
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Live
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {activeTenant?.name || (currentUser?.role === 'admin' ? 'System Console' : 'No Workspace (Setup Required)')}
            </p>
          </div>
        </div>

        {/* System Status Indicators & Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          
          {/* Backend Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-xs">
            <Server className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">Backend:</span>
            <span className={`flex items-center gap-1 font-medium ${isBackendOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isBackendOk ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              {isBackendOk ? 'Online' : 'Offline'}
            </span>
          </div>

          {/* Database Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-xs">
            <Database className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">TimescaleDB:</span>
            <span className={`flex items-center gap-1 font-medium ${isDbOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isDbOk ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {isDbOk ? 'Ready' : 'Waiting'}
            </span>
          </div>

          {/* Telemetry Storage Meter (10,000 Records Cap) */}
          {telemetryStats && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-xs">
              <HardDrive className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">Storage:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {(telemetryStats.total_records || 0).toLocaleString()} / {(telemetryStats.max_records || 10000).toLocaleString()}
              </span>
              {onPruneTelemetry && (
                <button
                  onClick={onPruneTelemetry}
                  disabled={isPruning}
                  title="Prune older records to 10,000 limit"
                  className="ml-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
                >
                  {isPruning ? '...' : 'Prune'}
                </button>
              )}
            </div>
          )}

          {/* Guardrail Alarms Indicator Button */}
          <button
            onClick={onOpenGuardrailsModal}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              openAlarmsCount > 0
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 dark:text-rose-300 border-rose-300 dark:border-rose-500/40 shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title="View Guardrails & Threshold Alarms"
          >
            <ShieldAlert className={`w-3.5 h-3.5 ${openAlarmsCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`} />
            <span className="hidden sm:inline">Guardrails</span>
            {openAlarmsCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                {openAlarmsCount}
              </span>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            )}
          </button>

          {/* User Authentication Status (JWT) */}
          {currentUser && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs shadow-xs">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                currentUser.role === 'admin'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              }`}>
                {currentUser.role || 'user'}
              </span>

              <div className="flex items-center gap-1 font-semibold text-slate-800">
                <span>{currentUser.name || currentUser.username}</span>
                <span className="text-slate-400 font-mono text-[10px]">(@{currentUser.username})</span>
              </div>

              <button
                onClick={onLogout}
                className="ml-1 px-2 py-0.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold transition-colors border border-rose-200"
                title="Sign Out of Session"
              >
                Sign Out
              </button>
            </div>
          )}

          {/* Temperature Unit Toggle */}
          <button
            onClick={() => setTempUnit(tempUnit === 'C' ? 'F' : 'C')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
            title="Toggle °C / °F"
          >
            <Thermometer className="w-3.5 h-3.5 text-emerald-500" />
            <span className="font-semibold">°{tempUnit}</span>
          </button>

          {/* Polling Controller & Countdown */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                {isPolling && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isPolling ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              </span>
              <span className="text-slate-700 dark:text-slate-300 font-mono font-medium w-16 text-center">
                {isPolling ? `Poll: ${countdown}s` : 'Paused'}
              </span>
            </div>

            <button
              onClick={() => setIsPolling(!isPolling)}
              className="p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
              title={isPolling ? 'Pause Auto-Polling' : 'Resume Auto-Polling'}
            >
              {isPolling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-500" />}
            </button>

            <button
              type="button"
              onClick={onManualRefresh}
              disabled={isRefreshing}
              className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors disabled:opacity-50 flex-shrink-0 cursor-pointer"
              title="Refresh Telemetry Now"
            >
              <span className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
              </span>
            </button>
          </div>

        </div>

      </div>
    </header>
  );
}
