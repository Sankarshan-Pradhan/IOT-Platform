import React from 'react';
import { 
  Thermometer, 
  Droplets, 
  Radio, 
  TrendingUp, 
  TrendingDown, 
  ArrowUp, 
  ArrowDown,
  ShieldCheck,
} from 'lucide-react';

export function TemperatureCard({
  valueC,
  tempUnit,
  minVal,
  maxVal,
  prevVal,
  deviceId,
}) {
  const hasValue = valueC !== null && valueC !== undefined && !isNaN(valueC);
  
  const displayVal = hasValue 
    ? (tempUnit === 'F' ? (valueC * 9 / 5 + 32).toFixed(1) : valueC.toFixed(1))
    : '—';

  const minDisplay = minVal !== null && minVal !== undefined
    ? (tempUnit === 'F' ? (minVal * 9 / 5 + 32).toFixed(1) : minVal.toFixed(1))
    : '—';

  const maxDisplay = maxVal !== null && maxVal !== undefined
    ? (tempUnit === 'F' ? (maxVal * 9 / 5 + 32).toFixed(1) : maxVal.toFixed(1))
    : '—';

  let trend = 'steady';
  let diff = 0;
  if (hasValue && prevVal !== null && prevVal !== undefined) {
    diff = valueC - prevVal;
    if (diff > 0.05) trend = 'up';
    else if (diff < -0.05) trend = 'down';
  }

  let comfort = 'Comfortable';
  let comfortColor = 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20';
  if (hasValue) {
    if (valueC < 18) {
      comfort = 'Cool / Chilly';
      comfortColor = 'text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-400 dark:bg-sky-500/10 dark:border-sky-500/20';
    } else if (valueC <= 26) {
      comfort = 'Comfortable';
      comfortColor = 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20';
    } else if (valueC <= 32) {
      comfort = 'Warm';
      comfortColor = 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20';
    } else {
      comfort = 'High Heat';
      comfortColor = 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20';
    }
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm dark:shadow-xl relative overflow-hidden flex flex-col justify-between transition-colors duration-200">
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/5 dark:bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/25">
              <Thermometer className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Live Temperature
              </span>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{deviceId}</p>
            </div>
          </div>

          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${comfortColor}`}>
            {comfort}
          </span>
        </div>

        {/* Big Value Display */}
        <div className="my-4 flex items-baseline gap-2">
          <span className="text-4xl sm:text-5xl font-mono font-extrabold tracking-tight text-slate-900 dark:text-white">
            {displayVal}
          </span>
          <span className="text-xl sm:text-2xl font-bold text-amber-500">
            °{tempUnit}
          </span>

          {trend !== 'steady' && (
            <span
              className={`ml-auto flex items-center text-xs font-mono font-semibold ${
                trend === 'up' ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400'
              }`}
            >
              {trend === 'up' ? <TrendingUp className="w-4 h-4 mr-0.5" /> : <TrendingDown className="w-4 h-4 mr-0.5" />}
              {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}°
            </span>
          )}
        </div>
      </div>

      {/* Min / Max Footer */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
        <div className="flex items-center gap-1.5">
          <ArrowDown className="w-3.5 h-3.5 text-sky-500" />
          <span>Min: <strong className="text-slate-800 dark:text-slate-200">{minDisplay}°{tempUnit}</strong></span>
        </div>
        <div className="flex items-center gap-1.5 justify-end">
          <ArrowUp className="w-3.5 h-3.5 text-rose-500" />
          <span>Max: <strong className="text-slate-800 dark:text-slate-200">{maxDisplay}°{tempUnit}</strong></span>
        </div>
      </div>
    </div>
  );
}

export function HumidityCard({
  valuePct,
  minVal,
  maxVal,
  prevVal,
  deviceId,
}) {
  const hasValue = valuePct !== null && valuePct !== undefined && !isNaN(valuePct);
  const displayVal = hasValue ? valuePct.toFixed(1) : '—';
  const minDisplay = minVal !== null && minVal !== undefined ? minVal.toFixed(1) : '—';
  const maxDisplay = maxVal !== null && maxVal !== undefined ? maxVal.toFixed(1) : '—';

  let trend = 'steady';
  let diff = 0;
  if (hasValue && prevVal !== null && prevVal !== undefined) {
    diff = valuePct - prevVal;
    if (diff > 0.1) trend = 'up';
    else if (diff < -0.1) trend = 'down';
  }

  let comfort = 'Optimal';
  let comfortColor = 'text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-400 dark:bg-cyan-500/10 dark:border-cyan-500/20';
  if (hasValue) {
    if (valuePct < 30) {
      comfort = 'Dry Air';
      comfortColor = 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20';
    } else if (valuePct <= 60) {
      comfort = 'Optimal';
      comfortColor = 'text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-400 dark:bg-cyan-500/10 dark:border-cyan-500/20';
    } else if (valuePct <= 75) {
      comfort = 'Moderate';
      comfortColor = 'text-teal-700 bg-teal-50 border-teal-200 dark:text-teal-400 dark:bg-teal-500/10 dark:border-teal-500/20';
    } else {
      comfort = 'High Humidity';
      comfortColor = 'text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-400 dark:bg-indigo-500/10 dark:border-indigo-500/20';
    }
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm dark:shadow-xl relative overflow-hidden flex flex-col justify-between transition-colors duration-200">
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-cyan-500/5 dark:bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-50 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/25">
              <Droplets className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Relative Humidity
              </span>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{deviceId}</p>
            </div>
          </div>

          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${comfortColor}`}>
            {comfort}
          </span>
        </div>

        {/* Big Value Display */}
        <div className="my-4 flex items-baseline gap-2">
          <span className="text-4xl sm:text-5xl font-mono font-extrabold tracking-tight text-slate-900 dark:text-white">
            {displayVal}
          </span>
          <span className="text-xl sm:text-2xl font-bold text-cyan-500">
            % RH
          </span>

          {trend !== 'steady' && (
            <span
              className={`ml-auto flex items-center text-xs font-mono font-semibold ${
                trend === 'up' ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-500'
              }`}
            >
              {trend === 'up' ? <TrendingUp className="w-4 h-4 mr-0.5" /> : <TrendingDown className="w-4 h-4 mr-0.5" />}
              {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Min / Max Footer */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
        <div className="flex items-center gap-1.5">
          <ArrowDown className="w-3.5 h-3.5 text-cyan-500" />
          <span>Min: <strong className="text-slate-800 dark:text-slate-200">{minDisplay}%</strong></span>
        </div>
        <div className="flex items-center gap-1.5 justify-end">
          <ArrowUp className="w-3.5 h-3.5 text-indigo-500" />
          <span>Max: <strong className="text-slate-800 dark:text-slate-200">{maxDisplay}%</strong></span>
        </div>
      </div>
    </div>
  );
}

export function SignalHealthCard({
  payload,
  deviceId,
  lastSeenTime,
}) {
  const rssi = payload?.wifi_rssi;
  const seq = payload?.seq;
  const uptimeS = payload?.uptime_s;

  const formatUptime = (seconds) => {
    if (!seconds && seconds !== 0) return '—';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  let signalLevel = 'Good';
  if (rssi) {
    if (rssi >= -50) signalLevel = 'Excellent';
    else if (rssi >= -65) signalLevel = 'Good';
    else if (rssi >= -75) signalLevel = 'Fair';
    else signalLevel = 'Weak';
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm dark:shadow-xl relative overflow-hidden flex flex-col justify-between transition-colors duration-200">
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Signal & Node Health
              </span>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{deviceId}</p>
            </div>
          </div>

          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            Active
          </span>
        </div>

        {/* Signal Metrics */}
        <div className="my-4 grid grid-cols-2 gap-3">
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">WiFi Signal</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-mono font-extrabold text-slate-900 dark:text-white">
                {rssi ? `${rssi}` : '—'}
              </span>
              <span className="text-xs text-slate-400 font-mono">dBm</span>
            </div>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5 block">
              {rssi ? `${signalLevel}` : 'WiFi Ready'}
            </span>
          </div>

          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">ESP32 Uptime</span>
            <div className="text-2xl font-mono font-extrabold text-slate-900 dark:text-white mt-1">
              {formatUptime(uptimeS)}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 block">
              {seq ? `Packet #${seq}` : 'Sampling 5s'}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
        <span>Cadence: <strong>5.0s</strong></span>
        <span className="text-slate-600 dark:text-slate-300">
          {lastSeenTime ? new Date(lastSeenTime).toLocaleTimeString() : 'Awaiting packet'}
        </span>
      </div>
    </div>
  );
}
