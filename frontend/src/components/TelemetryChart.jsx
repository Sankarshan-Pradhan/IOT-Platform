import React, { useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { LineChart } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function TelemetryChart({
  historyData,
  deviceId,
  tempUnit,
  limit,
  setLimit,
  isCompareMode = false,
  secondDeviceHistory = [],
  secondDeviceId = '',
  theme = 'dark',
}) {
  const [showTemp, setShowTemp] = useState(true);
  const [showHum, setShowHum] = useState(true);

  const isDark = theme === 'dark';

  const labels = historyData.map((item) => {
    const d = new Date(item.time);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  const getTemperature = (item) => {
    const raw = item?.payload?.temperature_c ?? item?.payload?.temperature;
    if (raw === undefined || raw === null || isNaN(raw)) return null;
    return tempUnit === 'F' ? parseFloat((raw * 9 / 5 + 32).toFixed(1)) : parseFloat(raw.toFixed(1));
  };

  const getHumidity = (item) => {
    const raw = item?.payload?.humidity_pct ?? item?.payload?.humidity;
    if (raw === undefined || raw === null || isNaN(raw)) return null;
    return parseFloat(raw.toFixed(1));
  };

  const tempValues = historyData.map(getTemperature);
  const humValues = historyData.map(getHumidity);

  const tempValues2 = secondDeviceHistory.map(getTemperature);
  const humValues2 = secondDeviceHistory.map(getHumidity);

  const datasets = [];

  if (isCompareMode) {
    if (showTemp) {
      datasets.push({
        label: `${deviceId} Temp (°${tempUnit})`,
        data: tempValues,
        borderColor: '#ea580c',
        backgroundColor: 'rgba(234, 88, 12, 0.08)',
        yAxisID: 'yTemp',
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 5,
      });
      datasets.push({
        label: `${secondDeviceId} Temp (°${tempUnit})`,
        data: tempValues2,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.08)',
        yAxisID: 'yTemp',
        tension: 0.35,
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 2,
        pointHoverRadius: 5,
      });
    }

    if (showHum) {
      datasets.push({
        label: `${deviceId} Humidity (%)`,
        data: humValues,
        borderColor: '#0891b2',
        backgroundColor: 'rgba(8, 145, 178, 0.08)',
        yAxisID: 'yHum',
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 5,
      });
      datasets.push({
        label: `${secondDeviceId} Humidity (%)`,
        data: humValues2,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        yAxisID: 'yHum',
        tension: 0.35,
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 2,
        pointHoverRadius: 5,
      });
    }
  } else {
    if (showTemp) {
      datasets.push({
        label: `Temperature (°${tempUnit})`,
        data: tempValues,
        borderColor: '#f97316',
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, isDark ? 'rgba(249, 115, 22, 0.25)' : 'rgba(249, 115, 22, 0.15)');
          gradient.addColorStop(1, 'rgba(249, 115, 22, 0.0)');
          return gradient;
        },
        fill: true,
        yAxisID: 'yTemp',
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: historyData.length > 50 ? 0 : 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#f97316',
      });
    }

    if (showHum) {
      datasets.push({
        label: 'Humidity (% RH)',
        data: humValues,
        borderColor: '#06b6d4',
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, isDark ? 'rgba(6, 182, 212, 0.2)' : 'rgba(6, 182, 212, 0.12)');
          gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');
          return gradient;
        },
        fill: true,
        yAxisID: 'yHum',
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: historyData.length > 50 ? 0 : 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#06b6d4',
      });
    }
  }

  const chartData = {
    labels: labels.length > 0 ? labels : ['Waiting for telemetry...'],
    datasets: datasets.length > 0 ? datasets : [{ label: 'No Data', data: [0] }],
  };

  const gridColor = isDark ? '#1e293b' : '#f1f5f9';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: textColor,
          boxWidth: 12,
          padding: 15,
          font: { family: 'Inter', size: 12 },
        },
      },
      tooltip: {
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderColor: isDark ? '#334155' : '#cbd5e1',
        borderWidth: 1,
        titleColor: isDark ? '#e2e8f0' : '#0f172a',
        bodyColor: isDark ? '#cbd5e1' : '#334155',
        padding: 12,
        bodyFont: { family: 'JetBrains Mono', size: 12 },
        titleFont: { family: 'Inter', size: 13, weight: 'bold' },
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        callbacks: {
          label: function (context) {
            let label = context.dataset.label || '';
            if (label) label += ': ';
            if (context.parsed.y !== null) {
              label += context.parsed.y;
            }
            return label;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: {
          color: textColor,
          maxRotation: 0,
          font: { family: 'JetBrains Mono', size: 10 },
          maxTicksLimit: 8,
        },
      },
      yTemp: {
        type: 'linear',
        display: showTemp,
        position: 'left',
        title: {
          display: true,
          text: `Temperature (°${tempUnit})`,
          color: '#ea580c',
          font: { family: 'Inter', size: 11, weight: 'bold' },
        },
        grid: { color: gridColor },
        ticks: {
          color: textColor,
          font: { family: 'JetBrains Mono', size: 11 },
        },
      },
      yHum: {
        type: 'linear',
        display: showHum,
        position: 'right',
        min: 0,
        max: 100,
        title: {
          display: true,
          text: 'Humidity (% RH)',
          color: '#0891b2',
          font: { family: 'Inter', size: 11, weight: 'bold' },
        },
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          color: textColor,
          font: { family: 'JetBrains Mono', size: 11 },
        },
      },
    },
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm dark:shadow-xl transition-colors duration-200">
      {/* Chart Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
            <LineChart className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isCompareMode ? 'Multi-Device Telemetry Comparison' : `Historical Telemetry: ${deviceId || 'Device'}`}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              TimescaleDB Hypertable Series • 5s Ingestion Cadence
            </p>
          </div>
        </div>

        {/* Filters and series toggles */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Toggles */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-lg p-1 border border-slate-200 dark:border-slate-700/60">
            <button
              onClick={() => setShowTemp(!showTemp)}
              className={`px-2.5 py-1 rounded font-medium flex items-center gap-1.5 transition ${
                showTemp
                  ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30'
                  : 'text-slate-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Temp
            </button>
            <button
              onClick={() => setShowHum(!showHum)}
              className={`px-2.5 py-1 rounded font-medium flex items-center gap-1.5 transition ${
                showHum
                  ? 'bg-cyan-100 text-cyan-800 border border-cyan-300 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/30'
                  : 'text-slate-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              Humidity
            </button>
          </div>

          {/* Sample count limit */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg p-1 border border-slate-200 dark:border-slate-700/60 font-mono">
            {[10, 20, 50, 100].map((num) => (
              <button
                key={num}
                onClick={() => setLimit(num)}
                className={`px-2 py-1 rounded transition text-xs ${
                  limit === num
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {num} pts
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-72 sm:h-80 w-full relative">
        {historyData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            <LineChart className="w-10 h-10 mb-2 stroke-1 text-slate-300 dark:text-slate-600" />
            <p className="font-medium text-slate-600 dark:text-slate-400">No telemetry recorded yet in this workspace.</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Connect your ESP32 or click "Send Test Packet" to populate telemetry points.
            </p>
          </div>
        ) : (
          <Line data={chartData} options={options} />
        )}
      </div>
    </div>
  );
}
