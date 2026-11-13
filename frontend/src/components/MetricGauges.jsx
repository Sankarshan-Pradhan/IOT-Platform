import React from 'react';
import { 
  Thermometer, 
  Droplets, 
  Radio, 
  TrendingUp, 
  TrendingDown,
  ShieldCheck,
  Zap,
} from 'lucide-react';

/**
 * SpeedometerGauge - Reusable Industrial SVG Semicircular Gauge
 * 
 * @param {number} value Current reading
 * @param {number} min Minimum range
 * @param {number} max Maximum range
 * @param {string} unit Unit label (°C, °F, %, dBm)
 * @param {string} title Gauge title
 * @param {string} subtitle Device ID or subtitle
 * @param {number} minRecorded Lowest recorded value in session
 * @param {number} maxRecorded Highest recorded value in session
 * @param {string} statusLabel Status text (e.g., Comfortable, Optimal)
 * @param {string} statusColor Tailwind badge class
 * @param {Array} zones Colored threshold segments [{ to: 18, color: '#38bdf8' }, ...]
 */
export function SpeedometerGauge({
  value,
  min = 0,
  max = 100,
  unit = '',
  title = '',
  subtitle = '',
  minRecorded = null,
  maxRecorded = null,
  statusLabel = '',
  statusColor = '',
  zones = [],
  trend = 'steady',
  diff = 0,
  icon: Icon = Zap,
  themeColor = '#ea580c',
  isAutoScaled = false,
}) {
  const hasValue = value !== null && value !== undefined && !isNaN(value);
  const safeVal = hasValue ? Math.min(Math.max(value, min), max) : min;
  const pct = (safeVal - min) / (max - min);

  // SVG Geometry
  const cx = 100;
  const cy = 95;
  const r = 70;
  const strokeWidth = 12;
  const circumference = Math.PI * r; // ~219.91
  const strokeDashoffset = circumference * (1 - pct);

  // Needle angle (-90deg at min, 0deg at middle, +90deg at max)
  const needleDeg = -90 + pct * 180;

  // Calculate position on arc for Min/Max recorded pin markers
  const getMarkerAngle = (val) => {
    if (val === null || val === undefined || isNaN(val)) return null;
    const p = Math.min(Math.max((val - min) / (max - min), 0), 1);
    return Math.PI * (1 - p); // Angle in radians
  };

  const minAngle = getMarkerAngle(minRecorded);
  const maxAngle = getMarkerAngle(maxRecorded);

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm dark:shadow-xl relative overflow-hidden flex flex-col justify-between transition-colors duration-200">
      {/* Background radial ambient glow */}
      <div 
        className="absolute -top-14 -right-14 w-32 h-32 rounded-full blur-2xl pointer-events-none opacity-20"
        style={{ backgroundColor: themeColor }}
      />

      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div 
              className="p-2 rounded-xl border flex items-center justify-center"
              style={{
                backgroundColor: `${themeColor}15`,
                borderColor: `${themeColor}35`,
                color: themeColor,
              }}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {title}
                </span>
                {isAutoScaled && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold font-mono">
                    AUTO
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{subtitle}</p>
            </div>
          </div>

          {statusLabel && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusColor}`}>
              {statusLabel}
            </span>
          )}
        </div>

        {/* SVG Dial Gauge Canvas */}
        <div className="relative w-full max-w-[240px] mx-auto my-1 flex flex-col items-center">
          <svg viewBox="0 0 200 120" className="w-full overflow-visible">
            <defs>
              {/* Dynamic filled gradient */}
              <linearGradient id={`gauge-grad-${title.replace(/\s+/g, '')}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="50%" stopColor="#10b981" />
                <stop offset="75%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>

            {/* Background Arc Track */}
            <path
              d="M 30 95 A 70 70 0 0 1 170 95"
              fill="none"
              stroke="currentColor"
              className="text-slate-100 dark:text-slate-800"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />

            {/* Threshold Zone Colored Pips (optional subtle ticks) */}
            {zones.map((zone, idx) => {
              const zonePct = Math.min(Math.max((zone.to - min) / (max - min), 0), 1);
              const angle = Math.PI * (1 - zonePct);
              const x = cx + (r - strokeWidth / 2) * Math.cos(angle);
              const y = cy - (r - strokeWidth / 2) * Math.sin(angle);
              return (
                <circle 
                  key={idx} 
                  cx={x} 
                  cy={y} 
                  r="2" 
                  fill={zone.color} 
                  opacity={0.7} 
                />
              );
            })}

            {/* Active Filled Arc */}
            <path
              d="M 30 95 A 70 70 0 0 1 170 95"
              fill="none"
              stroke={`url(#gauge-grad-${title.replace(/\s+/g, '')})`}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />

            {/* Min Recorded Indicator Marker Pin */}
            {minAngle !== null && (
              <circle
                cx={cx + r * Math.cos(minAngle)}
                cy={cy - r * Math.sin(minAngle)}
                r="3.5"
                fill="#38bdf8"
                stroke="#ffffff"
                strokeWidth="1.5"
                title={`Lowest: ${minRecorded}${unit}`}
              />
            )}

            {/* Max Recorded Indicator Marker Pin */}
            {maxAngle !== null && (
              <circle
                cx={cx + r * Math.cos(maxAngle)}
                cy={cy - r * Math.sin(maxAngle)}
                r="3.5"
                fill="#f43f5e"
                stroke="#ffffff"
                strokeWidth="1.5"
                title={`Peak: ${maxRecorded}${unit}`}
              />
            )}

            {/* Animated Needle / Pointer */}
            <g
              style={{
                transform: `rotate(${needleDeg}deg)`,
                transformOrigin: `${cx}px ${cy}px`,
                transition: 'transform 0.7s cubic-bezier(0.34, 1.4, 0.64, 1)',
              }}
            >
              {/* Needle Body */}
              <polygon
                points={`${cx - 3.5},${cy} ${cx + 3.5},${cy} ${cx},${cy - r + 8}`}
                className="fill-slate-800 dark:fill-white drop-shadow-sm"
              />
              {/* Needle Tip Highlight */}
              <circle cx={cx} cy={cy - r + 8} r="2.5" fill={themeColor} />
            </g>

            {/* Center Pivot Hub */}
            <circle cx={cx} cy={cy} r="8" className="fill-slate-800 dark:fill-white" />
            <circle cx={cx} cy={cy} r="4" fill={themeColor} />

            {/* Min & Max Range Labels */}
            <text x="30" y="112" textAnchor="middle" className="text-[9px] fill-slate-400 font-mono font-bold">
              {min}{unit}
            </text>
            <text x="170" y="112" textAnchor="middle" className="text-[9px] fill-slate-400 font-mono font-bold">
              {max}{unit}
            </text>
          </svg>

          {/* Digital Readout In Center */}
          <div className="flex flex-col items-center -mt-3">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-mono font-black tracking-tight text-slate-900 dark:text-white">
                {hasValue ? (Number.isInteger(value) ? value : value.toFixed(1)) : '—'}
              </span>
              <span className="text-base font-bold font-mono" style={{ color: themeColor }}>
                {unit}
              </span>
            </div>

            {/* Live Delta / Trend */}
            {trend !== 'steady' && (
              <span
                className={`flex items-center text-xs font-mono font-bold mt-0.5 ${
                  trend === 'up' ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400'
                }`}
              >
                {trend === 'up' ? <TrendingUp className="w-3.5 h-3.5 mr-0.5" /> : <TrendingDown className="w-3.5 h-3.5 mr-0.5" />}
                {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}{unit}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Min / Max Range Markers Footer */}
      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-400" />
          <span>Min: <strong className="text-slate-800 dark:text-slate-200">{minRecorded !== null ? `${minRecorded}${unit}` : '—'}</strong></span>
        </div>
        <div className="flex items-center gap-1.5 justify-end">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          <span>Max: <strong className="text-slate-800 dark:text-slate-200">{maxRecorded !== null ? `${maxRecorded}${unit}` : '—'}</strong></span>
        </div>
      </div>
    </div>
  );
}

/**
 * Computes adaptive min/max bounds for gauges with headroom padding
 * Auto-scales smoothly if sensors measure extreme temperatures (e.g. -20°C chillers or +120°C furnaces)
 */
function getAdaptiveBounds(currentVal, minRecorded, maxRecorded, defaultMin, defaultMax, step = 5) {
  const points = [];
  if (currentVal !== null && currentVal !== undefined && !isNaN(currentVal)) points.push(currentVal);
  if (minRecorded !== null && minRecorded !== undefined && !isNaN(minRecorded)) points.push(minRecorded);
  if (maxRecorded !== null && maxRecorded !== undefined && !isNaN(maxRecorded)) points.push(maxRecorded);

  if (points.length === 0) {
    return { min: defaultMin, max: defaultMax, isAutoScaled: false };
  }

  const lowest = Math.min(...points);
  const highest = Math.max(...points);

  // If reading fits comfortably inside standard bounds, keep default limits
  if (lowest >= defaultMin && highest <= defaultMax) {
    return { min: defaultMin, max: defaultMax, isAutoScaled: false };
  }

  // Auto-scale to comfortably wrap extreme sensor readings
  const span = Math.max(highest - lowest, 10);
  const padding = Math.max(span * 0.15, step);

  const autoMin = lowest < defaultMin ? Math.floor((lowest - padding) / step) * step : defaultMin;
  const autoMax = highest > defaultMax ? Math.ceil((highest + padding) / step) * step : defaultMax;

  return { min: autoMin, max: autoMax, isAutoScaled: true };
}

/**
 * MetricGauges - 3-Column Cockpit of Live Industrial Radial Gauges
 */
export default function MetricGauges({
  currentTemp,
  tempUnit = 'C',
  minTemp,
  maxTemp,
  prevTemp,
  currentHum,
  minHum,
  maxHum,
  prevHum,
  payload = {},
  deviceId = '',
}) {
  const displayTemp = currentTemp !== null && currentTemp !== undefined && !isNaN(currentTemp)
    ? (tempUnit === 'F' ? currentTemp * 1.8 + 32 : currentTemp)
    : null;

  const minTempDisplay = minTemp !== null && minTemp !== undefined
    ? (tempUnit === 'F' ? minTemp * 1.8 + 32 : minTemp)
    : null;

  const maxTempDisplay = maxTemp !== null && maxTemp !== undefined
    ? (tempUnit === 'F' ? maxTemp * 1.8 + 32 : maxTemp)
    : null;

  // 1. Auto-scaling bounds for Temperature
  const stdMinTemp = tempUnit === 'F' ? 32 : 0;
  const stdMaxTemp = tempUnit === 'F' ? 122 : 50;
  const tempStep = tempUnit === 'F' ? 10 : 5;
  const tempBounds = getAdaptiveBounds(displayTemp, minTempDisplay, maxTempDisplay, stdMinTemp, stdMaxTemp, tempStep);

  const tSpan = tempBounds.max - tempBounds.min;
  const tempZones = [
    { to: parseFloat((tempBounds.min + tSpan * 0.30).toFixed(1)), color: '#38bdf8' },
    { to: parseFloat((tempBounds.min + tSpan * 0.60).toFixed(1)), color: '#10b981' },
    { to: parseFloat((tempBounds.min + tSpan * 0.80).toFixed(1)), color: '#f59e0b' },
    { to: tempBounds.max, color: '#ef4444' },
  ];

  let tempTrend = 'steady';
  let tempDiff = 0;
  if (currentTemp !== null && prevTemp !== null && currentTemp !== undefined && prevTemp !== undefined) {
    tempDiff = tempUnit === 'F' ? (currentTemp - prevTemp) * 1.8 : (currentTemp - prevTemp);
    if (tempDiff > 0.05) tempTrend = 'up';
    else if (tempDiff < -0.05) tempTrend = 'down';
  }

  let tempComfort = 'Comfortable';
  let tempColor = 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20';
  if (currentTemp !== null && !isNaN(currentTemp)) {
    if (currentTemp < 18) {
      tempComfort = 'Cool / Chilly';
      tempColor = 'text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-400 dark:bg-sky-500/10 dark:border-sky-500/20';
    } else if (currentTemp <= 26) {
      tempComfort = 'Comfortable';
      tempColor = 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20';
    } else if (currentTemp <= 32) {
      tempComfort = 'Warm';
      tempColor = 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20';
    } else {
      tempComfort = 'High Heat';
      tempColor = 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20';
    }
  }

  // 2. Auto-scaling bounds for Humidity
  const humBounds = getAdaptiveBounds(currentHum, minHum, maxHum, 0, 100, 10);
  const hSpan = humBounds.max - humBounds.min;
  const humZones = [
    { to: parseFloat((humBounds.min + hSpan * 0.30).toFixed(1)), color: '#f59e0b' },
    { to: parseFloat((humBounds.min + hSpan * 0.60).toFixed(1)), color: '#06b6d4' },
    { to: parseFloat((humBounds.min + hSpan * 0.75).toFixed(1)), color: '#0d9488' },
    { to: humBounds.max, color: '#6366f1' },
  ];

  let humTrend = 'steady';
  let humDiff = 0;
  if (currentHum !== null && prevHum !== null && currentHum !== undefined && prevHum !== undefined) {
    humDiff = currentHum - prevHum;
    if (humDiff > 0.1) humTrend = 'up';
    else if (humDiff < -0.1) humTrend = 'down';
  }

  let humComfort = 'Optimal';
  let humColor = 'text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-400 dark:bg-cyan-500/10 dark:border-cyan-500/20';
  if (currentHum !== null && !isNaN(currentHum)) {
    if (currentHum < 30) {
      humComfort = 'Dry Air';
      humColor = 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20';
    } else if (currentHum <= 60) {
      humComfort = 'Optimal';
      humColor = 'text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-400 dark:bg-cyan-500/10 dark:border-cyan-500/20';
    } else if (currentHum <= 75) {
      humComfort = 'Moderate';
      humColor = 'text-teal-700 bg-teal-50 border-teal-200 dark:text-teal-400 dark:bg-teal-500/10 dark:border-teal-500/20';
    } else {
      humComfort = 'High Humidity';
      humColor = 'text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-400 dark:bg-indigo-500/10 dark:border-indigo-500/20';
    }
  }

  // 3. Signal & Node Health Setup
  const rssi = payload?.wifi_rssi;
  const rssiBounds = getAdaptiveBounds(rssi ?? -70, -95, -45, -100, -30, 5);

  let signalLevel = 'Good';
  let signalBadge = 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20';
  if (rssi) {
    if (rssi >= -50) {
      signalLevel = 'Excellent';
      signalBadge = 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20';
    } else if (rssi >= -65) {
      signalLevel = 'Good';
      signalBadge = 'text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-400 dark:bg-cyan-500/10 dark:border-cyan-500/20';
    } else if (rssi >= -75) {
      signalLevel = 'Fair';
      signalBadge = 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20';
    } else {
      signalLevel = 'Weak';
      signalBadge = 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20';
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
      {/* Gauge 1: Live Temperature Speedometer */}
      <SpeedometerGauge
        value={displayTemp}
        min={tempBounds.min}
        max={tempBounds.max}
        unit={`°${tempUnit}`}
        title="Live Temperature"
        subtitle={deviceId || 'Sensor Node'}
        minRecorded={minTempDisplay !== null ? parseFloat(minTempDisplay.toFixed(1)) : null}
        maxRecorded={maxTempDisplay !== null ? parseFloat(maxTempDisplay.toFixed(1)) : null}
        statusLabel={tempComfort}
        statusColor={tempColor}
        trend={tempTrend}
        diff={tempDiff}
        icon={Thermometer}
        themeColor="#f97316"
        zones={tempZones}
        isAutoScaled={tempBounds.isAutoScaled}
      />

      {/* Gauge 2: Relative Humidity Speedometer */}
      <SpeedometerGauge
        value={currentHum}
        min={humBounds.min}
        max={humBounds.max}
        unit="%"
        title="Relative Humidity"
        subtitle={deviceId || 'Sensor Node'}
        minRecorded={minHum !== null ? parseFloat(minHum.toFixed(1)) : null}
        maxRecorded={maxHum !== null ? parseFloat(maxHum.toFixed(1)) : null}
        statusLabel={humComfort}
        statusColor={humColor}
        trend={humTrend}
        diff={humDiff}
        icon={Droplets}
        themeColor="#06b6d4"
        zones={humZones}
        isAutoScaled={humBounds.isAutoScaled}
      />

      {/* Gauge 3: Wi-Fi Signal Strength & Health */}
      <SpeedometerGauge
        value={rssi ?? -70}
        min={rssiBounds.min}
        max={rssiBounds.max}
        unit=" dBm"
        title="Signal Reception"
        subtitle={payload?.uptime_s ? `Uptime: ${Math.floor(payload.uptime_s / 60)}m` : 'Sampling 5s'}
        minRecorded={-95}
        maxRecorded={-45}
        statusLabel={signalLevel}
        statusColor={signalBadge}
        trend="steady"
        diff={0}
        icon={Radio}
        themeColor="#10b981"
        zones={[
          { to: -80, color: '#ef4444' },
          { to: -65, color: '#f59e0b' },
          { to: -50, color: '#10b981' },
          { to: -30, color: '#06b6d4' },
        ]}
        isAutoScaled={rssiBounds.isAutoScaled}
      />
    </div>
  );
}
