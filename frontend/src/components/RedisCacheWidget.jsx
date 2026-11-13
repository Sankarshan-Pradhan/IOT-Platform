import React, { useState, useEffect } from 'react';
import { Zap, RefreshCw, Trash2, CheckCircle2, AlertCircle, Database } from 'lucide-react';
import { fetchCacheStats, flushCache } from '../api';

export default function RedisCacheWidget() {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const data = await fetchCacheStats();
      setStats(data);
    } catch (err) {
      console.warn('Failed to load cache stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    // Auto-refresh stats every 15 seconds
    const interval = setInterval(loadStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleFlush = async () => {
    if (!window.confirm('Flush all keys from the Redis L1 in-memory cache? Telemetry will continue safely from TimescaleDB.')) {
      return;
    }
    setIsFlushing(true);
    try {
      await flushCache();
      setActionMessage('L1 Cache flushed successfully');
      await loadStats();
      setTimeout(() => setActionMessage(null), 3500);
    } catch (err) {
      setActionMessage(`Error: ${err.message}`);
      setTimeout(() => setActionMessage(null), 4000);
    } finally {
      setIsFlushing(false);
    }
  };

  const isConnected = stats?.connected ?? false;
  const hitRatio = stats?.hit_ratio_percent ?? '0.0%';
  const totalKeys = stats?.total_keys ?? 0;
  const memoryUsed = stats?.memory_used_human ?? '1.15M';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Left: Redis Engine Health Badge */}
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border ${
            isConnected 
              ? 'bg-rose-50 text-rose-600 border-rose-200' 
              : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}>
            <Zap className={`w-5 h-5 ${isConnected ? 'fill-rose-500 text-rose-500 animate-pulse' : ''}`} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                <span>Redis L1 Cache Engine</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isConnected 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {isConnected ? 'Active :6379' : 'In-Memory Fallback'}
                </span>
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Sub-millisecond O(1) telemetry lookups & distributed authentication rate limiting.
            </p>
          </div>
        </div>

        {/* Right: Performance KPIs & Actions */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Key Metrics Pill Strip */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 text-xs text-slate-600">
            <div className="px-2 py-1 flex items-center gap-1.5 border-r border-slate-200">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Hit Ratio:</span>
              <span className="font-mono font-bold text-emerald-600">{hitRatio}</span>
            </div>

            <div className="px-2 py-1 flex items-center gap-1.5 border-r border-slate-200">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Cached Keys:</span>
              <span className="font-mono font-bold text-slate-800">{totalKeys}</span>
            </div>

            <div className="px-2 py-1 flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">RAM Used:</span>
              <span className="font-mono font-bold text-indigo-600">{memoryUsed}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
            <button
              onClick={loadStats}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition cursor-pointer"
              title="Refresh Cache Stats"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

            <button
              onClick={handleFlush}
              disabled={isFlushing}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold transition cursor-pointer"
              title="Flush L1 Cache"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isFlushing ? 'Flushing...' : 'Flush Cache'}</span>
            </button>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="mt-3 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{actionMessage}</span>
        </div>
      )}
    </div>
  );
}
