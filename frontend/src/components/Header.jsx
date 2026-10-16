import React from 'react';
import { 
  Activity, 
  RefreshCw, 
  Database, 
  Server, 
  Play, 
  Pause, 
  Thermometer, 
  Sun, 
  Moon 
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
  theme,
  setTheme,
  lastPolledAt,
  activeTenant,
}) {
  const isBackendOk = health && health.status === 'ok';
  const isDbOk = health && health.database === 'connected';

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

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
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Live
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {activeTenant?.name || 'Default Workspace'}
            </p>
          </div>
        </div>

        {/* System Status Indicators & Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          
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

          {/* Temperature Unit Toggle */}
          <button
            onClick={() => setTempUnit(tempUnit === 'C' ? 'F' : 'C')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
            title="Toggle °C / °F"
          >
            <Thermometer className="w-3.5 h-3.5 text-emerald-500" />
            <span className="font-semibold">°{tempUnit}</span>
          </button>

          {/* Theme Switcher Toggle (Light / Dark Mode) */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition shadow-sm"
            title={theme === 'dark' ? 'Switch to Clean Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline font-medium">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline font-medium">Dark</span>
              </>
            )}
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
              <span className="text-slate-700 dark:text-slate-300 font-mono font-medium">
                {isPolling ? `Poll: ${countdown}s` : 'Paused'}
              </span>
            </div>

            <button
              onClick={() => setIsPolling(!isPolling)}
              className="p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition"
              title={isPolling ? 'Pause Auto-Polling' : 'Resume Auto-Polling'}
            >
              {isPolling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-500" />}
            </button>

            <button
              onClick={onManualRefresh}
              disabled={isRefreshing}
              className="p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition disabled:opacity-50"
              title="Refresh Telemetry Now"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
            </button>
          </div>

        </div>

      </div>
      
      {lastPolledAt && (
        <div className="max-w-7xl mx-auto mt-1 flex justify-end">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
            Last polled: {lastPolledAt.toLocaleTimeString()}
          </span>
        </div>
      )}
    </header>
  );
}
