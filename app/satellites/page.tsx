'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import type { Spacecraft, OrbitalPosition, OrbitalDataResponse } from '@/lib/types';
import { LoadingState, ErrorState } from '@/components/ui/LoadingState';
import { StatusBadge, HealthBadge } from '@/components/ui/Badge';
import { HealthBar } from '@/components/ui/HealthBar';
import { formatRelativeTime } from '@/lib/utils';
import {
  Search,
  SortAsc,
  SortDesc,
  Filter,
  AlertTriangle,
  ChevronRight,
  Globe,
  Navigation,
  Gauge,
  RefreshCw,
  AlertCircle,
  Radio,
  Info,
} from 'lucide-react';
import Link from 'next/link';

type SortField = 'name' | 'health_score' | 'status' | 'active_anomalies' | 'last_telemetry_at';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'nominal' | 'warning' | 'critical';

const STATUS_ORDER: Record<string, number> = { critical: 0, warning: 1, offline: 2, maintenance: 3, nominal: 4 };

// ── Orbital data panel ────────────────────────────────────────────────────────

interface OrbitalPanelProps {
  positions: OrbitalPosition[];
  dataSource: OrbitalDataResponse['data_source'];
  note?: string;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function visibilityColor(v: OrbitalPosition['visibility']) {
  switch (v) {
    case 'visible':   return 'text-emerald-400';
    case 'daylight':  return 'text-amber-400';
    case 'eclipsed':  return 'text-blue-400';
    default:          return 'text-slate-500';
  }
}

function OrbitalDataPanel({ positions, dataSource, note, loading, error, onRefresh }: OrbitalPanelProps) {
  const isLive      = dataSource === 'live' || dataSource === 'n2yo';
  const isFallback  = dataSource === 'fallback';
  const isSimulated = dataSource === 'simulated';

  return (
    <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl overflow-hidden mb-5">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e2d4a]">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-slate-200">Orbital Tracking</span>
          {/* Source badge */}
          {isLive && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 font-medium">
              LIVE · N2YO
            </span>
          )}
          {isFallback && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-400/10 border border-orange-400/20 text-orange-400 font-medium">
              FALLBACK
            </span>
          )}
          {isSimulated && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400 font-medium">
              DEMO
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh orbital data"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded hover:bg-[#111d35] disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Disclaimer for simulated / fallback */}
      {(isSimulated || isFallback) && note && (
        <div className="flex items-start gap-2 px-5 py-2 bg-amber-400/5 border-b border-amber-400/10">
          <Info className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-amber-300/80 leading-relaxed">{note}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 px-5 py-2 bg-red-400/5 border-b border-red-400/10">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-red-400 leading-relaxed">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-[#080d1a] border border-[#1e2d4a] animate-pulse" />
          ))}
        </div>
      )}

      {/* Positions grid */}
      {!loading && positions.length > 0 && (
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {positions.map(pos => (
            <div
              key={pos.norad_id}
              className="bg-[#080d1a] border border-[#1e2d4a] rounded-lg p-3 space-y-2"
            >
              {/* Name + NORAD */}
              <div>
                <div className="text-xs font-mono font-semibold text-slate-100 truncate" title={pos.name}>
                  {pos.name}
                </div>
                <div className="text-[10px] text-slate-500">NORAD {pos.norad_id}</div>
              </div>

              {/* Position */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Navigation className="w-3 h-3 text-blue-400 flex-shrink-0" />
                  <span className="text-[11px] font-mono text-slate-300">
                    {pos.latitude >= 0 ? '+' : ''}{pos.latitude.toFixed(2)}°,{' '}
                    {pos.longitude >= 0 ? '+' : ''}{pos.longitude.toFixed(2)}°
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Radio className="w-3 h-3 text-purple-400 flex-shrink-0" />
                  <span className="text-[11px] font-mono text-slate-300">{pos.altitude_km.toFixed(0)} km alt</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Gauge className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                  <span className="text-[11px] font-mono text-slate-300">{pos.velocity_km_s.toFixed(2)} km/s</span>
                </div>
              </div>

              {/* Visibility */}
              <div className={`text-[10px] font-medium uppercase tracking-wider ${visibilityColor(pos.visibility)}`}>
                {pos.visibility}
              </div>

              {/* Data tag */}
              <div className="text-[9px] text-slate-600 uppercase tracking-wider">
                {pos.is_live ? '● live position' : '○ simulated'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && positions.length === 0 && !error && (
        <div className="py-8 text-center text-sm text-slate-500">No orbital positions available.</div>
      )}

      {/* Note for distinct orbital vs telemetry */}
      <div className="px-5 pb-3">
        <p className="text-[10px] text-slate-600">
          Orbital positions are distinct from spacecraft telemetry. Position data shows real-time ground-track coordinates;
          subsystem telemetry and anomaly detection use the simulated fleet engine.
        </p>
      </div>
    </div>
  );
}

// ── Main Satellites page ──────────────────────────────────────────────────────

export default function SatellitesPage() {
  const [spacecraft, setSpacecraft] = useState<Spacecraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Orbital data state
  const [orbitalData, setOrbitalData] = useState<OrbitalDataResponse | null>(null);
  const [orbitalLoading, setOrbitalLoading] = useState(true);
  const [orbitalError, setOrbitalError] = useState<string | null>(null);

  // ── Fleet data ──
  const fetchFleetData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/satellites');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setSpacecraft(json.spacecraft || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load spacecraft');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Orbital data ──
  const fetchOrbitalData = useCallback(async () => {
    setOrbitalLoading(true);
    setOrbitalError(null);
    try {
      const res = await fetch('/api/orbital');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: OrbitalDataResponse = await res.json();
      setOrbitalData(json);
    } catch (err) {
      setOrbitalError(err instanceof Error ? err.message : 'Failed to load orbital data');
      // Keep whatever we had before
    } finally {
      setOrbitalLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFleetData();
    fetchOrbitalData();
  }, [fetchFleetData, fetchOrbitalData]);

  const filtered = useMemo(() => {
    let result = [...spacecraft];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(sc =>
        sc.name.toLowerCase().includes(q) ||
        sc.mission.toLowerCase().includes(q) ||
        sc.orbit_type.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(sc => sc.status === statusFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'health_score') cmp = a.health_score - b.health_score;
      else if (sortField === 'status') cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      else if (sortField === 'active_anomalies') cmp = a.active_anomalies - b.active_anomalies;
      else if (sortField === 'last_telemetry_at') cmp = new Date(a.last_telemetry_at).getTime() - new Date(b.last_telemetry_at).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [spacecraft, search, sortField, sortDir, statusFilter]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />;
  };

  if (loading) return (
    <AppShell title="Satellites" subtitle="Fleet spacecraft management">
      <LoadingState message="Loading spacecraft data..." />
    </AppShell>
  );

  if (error) return (
    <AppShell title="Satellites">
      <ErrorState message={error} onRetry={fetchFleetData} />
    </AppShell>
  );

  return (
    <AppShell
      title="Satellites"
      subtitle={`${spacecraft.length} spacecraft in fleet`}
      dataSource={orbitalData?.data_source ?? 'simulated'}
    >
      {/* ── Orbital Tracking Panel ── */}
      <OrbitalDataPanel
        positions={orbitalData?.positions ?? []}
        dataSource={orbitalData?.data_source ?? 'simulated'}
        note={orbitalData?.note}
        loading={orbitalLoading}
        error={orbitalError}
        onRefresh={fetchOrbitalData}
      />

      {/* ── Fleet Controls ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search spacecraft, mission..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#0f1a2e] border border-[#1e2d4a] rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          {(['all', 'nominal', 'warning', 'critical'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600/20 border border-blue-500/40 text-blue-300'
                  : 'bg-[#0f1a2e] border border-[#1e2d4a] text-slate-400 hover:text-slate-200'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== 'all' && (
                <span className="ml-1 text-[10px] opacity-70">
                  ({spacecraft.filter(sc => sc.status === s).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Fleet Table ── */}
      <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_0.8fr_0.5fr] gap-4 px-5 py-3 border-b border-[#1e2d4a] text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-slate-300 text-left">
            Spacecraft <SortIcon field="name" />
          </button>
          <span>Mission</span>
          <button onClick={() => toggleSort('status')} className="flex items-center gap-1 hover:text-slate-300">
            Status <SortIcon field="status" />
          </button>
          <button onClick={() => toggleSort('health_score')} className="flex items-center gap-1 hover:text-slate-300">
            Health <SortIcon field="health_score" />
          </button>
          <span>Risk</span>
          <button onClick={() => toggleSort('active_anomalies')} className="flex items-center gap-1 hover:text-slate-300">
            Anomalies <SortIcon field="active_anomalies" />
          </button>
          <span>Updated</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-[#1e2d4a]">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No spacecraft match your filters.
            </div>
          ) : (
            filtered.map(sc => (
              <Link
                key={sc.id}
                href={`/satellites/${sc.id}`}
                className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_0.8fr_0.5fr] gap-4 px-5 py-4 hover:bg-[#111d35] transition-colors items-center group"
              >
                {/* Name */}
                <div>
                  <div className="text-sm font-mono font-semibold text-slate-200 group-hover:text-blue-300 transition-colors">
                    {sc.name}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{sc.orbit_type}</div>
                </div>

                {/* Mission */}
                <div className="text-xs text-slate-400 truncate">{sc.mission}</div>

                {/* Status */}
                <StatusBadge status={sc.status} />

                {/* Health */}
                <div className="space-y-1">
                  <HealthBadge score={sc.health_score} />
                  <HealthBar score={sc.health_score} showValue={false} size="sm" />
                </div>

                {/* Risk */}
                <div className={`text-xs font-medium ${
                  sc.risk_level === 'critical' ? 'text-red-400' :
                  sc.risk_level === 'high' ? 'text-orange-400' :
                  sc.risk_level === 'medium' ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {sc.risk_level.toUpperCase()}
                </div>

                {/* Anomalies */}
                <div className="flex items-center gap-1">
                  {sc.active_anomalies > 0 ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-xs text-orange-400 font-medium">{sc.active_anomalies}</span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">—</span>
                  )}
                </div>

                {/* Last update */}
                <div className="flex items-center gap-1 justify-end">
                  <span className="text-[10px] text-slate-500">
                    {formatRelativeTime(sc.last_telemetry_at)}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Count */}
      <div className="mt-3 text-xs text-slate-500">
        Showing {filtered.length} of {spacecraft.length} spacecraft
      </div>
    </AppShell>
  );
}
