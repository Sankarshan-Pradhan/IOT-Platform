import React from 'react';
import { Table, Wifi } from 'lucide-react';

export default function RecentTable({ historyData, tempUnit }) {
  if (!historyData || historyData.length === 0) {
    return null;
  }

  const recentRecords = [...historyData].reverse().slice(0, 10);

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm dark:shadow-xl transition-colors duration-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Table className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Telemetry Ingestions</h3>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          Showing last {recentRecords.length} entries
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="text-[11px] text-slate-400 dark:text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="py-2.5 px-3">Timestamp</th>
              <th className="py-2.5 px-3">Device ID</th>
              <th className="py-2.5 px-3">Temp (°{tempUnit})</th>
              <th className="py-2.5 px-3">Humidity (%)</th>
              <th className="py-2.5 px-3">Sequence</th>
              <th className="py-2.5 px-3">WiFi RSSI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {recentRecords.map((item, idx) => {
              const p = item.payload || {};
              const d = new Date(item.time);
              const tempVal = p.temperature_c ?? p.temperature;
              const displayTemp = tempVal !== undefined
                ? (tempUnit === 'F' ? (tempVal * 9 / 5 + 32).toFixed(1) : tempVal.toFixed(1))
                : '—';
              const humVal = p.humidity_pct ?? p.humidity;
              const displayHum = humVal !== undefined ? humVal.toFixed(1) : '—';

              return (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="py-2 px-3 text-slate-500 dark:text-slate-400">
                    {d.toLocaleTimeString()} <span className="text-[10px] text-slate-400 dark:text-slate-600">{d.toLocaleDateString()}</span>
                  </td>
                  <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                    {item.device_id}
                  </td>
                  <td className="py-2 px-3 text-amber-600 dark:text-amber-400 font-bold">
                    {displayTemp}°{tempUnit}
                  </td>
                  <td className="py-2 px-3 text-cyan-600 dark:text-cyan-400 font-bold">
                    {displayHum}%
                  </td>
                  <td className="py-2 px-3 text-slate-500 dark:text-slate-400">
                    #{p.seq || idx + 1}
                  </td>
                  <td className="py-2 px-3 text-slate-500 dark:text-slate-400">
                    {p.wifi_rssi ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <Wifi className="w-3 h-3" />
                        {p.wifi_rssi} dBm
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
