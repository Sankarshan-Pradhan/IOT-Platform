import React from 'react';
import { 
  Sparkles, 
  HelpCircle, 
  Cpu, 
  Radio, 
  LineChart, 
  X, 
  ChevronRight, 
  Plus, 
  CheckCircle2,
  Info
} from 'lucide-react';

export function OnboardingBanner({ isVisible, onClose, onAddDevice }) {
  if (!isVisible) return null;

  return (
    <div className="rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-cyan-500/10 border border-emerald-500/30 p-5 shadow-sm relative overflow-hidden transition-all duration-300">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>First Time Here? Welcome to Your IoT Dashboard!</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                Quick Start
              </span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Follow these 3 simple steps to monitor live environmental telemetry from your sensors.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition"
          title="Dismiss guide"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 3 Step Cards */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        
        {/* Step 1 */}
        <div className="rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold flex items-center justify-center">
              1
            </span>
            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white">
              <Cpu className="w-3.5 h-3.5 text-emerald-500" />
              <span>Select or Add a Device</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Choose an active sensor node from the device selector, or register a new one to organize your workspace.
          </p>
        </div>

        {/* Step 2 */}
        <div className="rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="w-6 h-6 rounded-lg bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 text-xs font-bold flex items-center justify-center">
              2
            </span>
            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white">
              <Radio className="w-3.5 h-3.5 text-cyan-500" />
              <span>Stream Live Telemetry</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Your ESP32 publishes temperature & humidity readings via MQTT or HTTP. Unknown devices auto-register on first packet!
          </p>
        </div>

        {/* Step 3 */}
        <div className="rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="w-6 h-6 rounded-lg bg-teal-100 dark:teal-500/20 text-teal-700 dark:text-teal-400 text-xs font-bold flex items-center justify-center">
              3
            </span>
            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white">
              <LineChart className="w-3.5 h-3.5 text-teal-500" />
              <span>Real-Time Charts</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            The dashboard refreshes every 5 seconds. View live temperature (°C/°F), humidity (% RH), delta trends, and charts.
          </p>
        </div>

      </div>

      <div className="mt-3.5 flex items-center justify-between text-xs pt-3 border-t border-emerald-500/20">
        <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-emerald-500" />
          <span>Tip: You can toggle Celsius/Fahrenheit anytime in the top bar.</span>
        </span>

        <button
          onClick={onAddDevice}
          className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Your First Device</span>
        </button>
      </div>
    </div>
  );
}

export function EmptyDashboardState({ onAddDevice, isAdmin = false }) {
  return (
    <div className="rounded-2xl p-8 sm:p-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-5 shadow-sm">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center mx-auto shadow-inner">
        <Cpu className="w-8 h-8" />
      </div>

      <div className="max-w-md mx-auto space-y-2">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          No Sensor Data Streaming Yet
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {isAdmin
            ? 'Supervisory Monitor: No sensor nodes are currently transmitting in this workspace. Telemetry will automatically stream when devices connect.'
            : 'Your workspace is clean and ready. Once an ESP32 or sensor node starts publishing temperature and humidity, it will immediately appear here with live statistics and historical charts.'}
        </p>
      </div>

      {!isAdmin && (
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onAddDevice}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2 transition shadow-md shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Register a Sensor Device</span>
          </button>
        </div>
      )}
    </div>
  );
}
