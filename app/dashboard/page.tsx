'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardMetrics, Spacecraft, Anomaly } from '@/lib/types';
import { LoadingState, ErrorState } from '@/components/ui/LoadingState';
import { FleetMetricsBar } from '@/components/dashboard/FleetMetricsBar';
import { TelemetryOverviewChart } from '@/components/dashboard/TelemetryOverviewChart';
import { AnomalyTimeline } from '@/components/dashboard/AnomalyTimeline';
import { AIMissionBrief } from '@/components/dashboard/AIMissionBrief';
import { SpacecraftStatusGrid } from '@/components/dashboard/SpacecraftStatusGrid';
import { RefreshCw } from 'lucide-react';

interface DashboardData {
  spacecraft: Spacecraft[];
  metrics: DashboardMetrics;
  anomalies: Anomaly[];
  data_source: 'live' | 'simulated' | 'fallback';
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <AppShell title="Mission Dashboard" subtitle="Fleet status overview">
        <LoadingState message="Loading mission data..." />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell title="Mission Dashboard">
        <ErrorState message={error || 'Unknown error'} onRetry={fetchData} />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Mission Dashboard"
      subtitle={`${data.spacecraft.length} spacecraft monitored`}
      dataSource={data.data_source}
    >
      {/* Refresh indicator */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${data.metrics.critical_spacecraft > 0 ? 'bg-red-400 status-indicator-critical' : 'bg-emerald-400'}`} />
          <span className="text-xs text-slate-400">
            Mission status:{' '}
            <span className={data.metrics.critical_spacecraft > 0 ? 'text-red-400 font-medium' : 'text-emerald-400 font-medium'}>
              {data.metrics.critical_spacecraft > 0 ? 'ANOMALY DETECTED' : 'ALL SYSTEMS NOMINAL'}
            </span>
          </span>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded hover:bg-[#111d35]"
        >
          <RefreshCw className="w-3 h-3" />
          {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : 'Refresh'}
        </button>
      </div>

      {/* Fleet metrics */}
      <FleetMetricsBar metrics={data.metrics} />

      {/* Main content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-5">
        {/* Telemetry overview — takes 2 columns */}
        <div className="xl:col-span-2 space-y-5">
          <TelemetryOverviewChart spacecraft={data.spacecraft} />
          <SpacecraftStatusGrid spacecraft={data.spacecraft} />
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <AIMissionBrief spacecraft={data.spacecraft} anomalies={data.anomalies} />
          <AnomalyTimeline anomalies={data.anomalies} />
        </div>
      </div>
    </AppShell>
  );
}
