'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Spacecraft, TelemetryReading, Anomaly, TIME_RANGES } from '@/lib/types';
import { LoadingState, ErrorState } from '@/components/ui/LoadingState';
import { StatusBadge, SeverityBadge } from '@/components/ui/Badge';
import { HealthBar } from '@/components/ui/HealthBar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { formatRelativeTime, getHealthBg } from '@/lib/utils';
import { TelemetrySimPanel } from '@/components/telemetry/TelemetrySimPanel';
import { GroundTrackWidget } from '@/components/telemetry/GroundTrackWidget';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Activity,
  Battery,
  Thermometer,
  Radio,
  Navigation,
  Zap,
  Brain,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import Link from 'next/link';

const TELEMETRY_CHARTS = [
  { key: 'battery_voltage', label: 'Battery Voltage', unit: 'V', color: '#3b82f6', icon: Battery },
  { key: 'power_consumption', label: 'Power Consumption', unit: 'W', color: '#a855f7', icon: Zap },
  { key: 'temperature_internal', label: 'Internal Temperature', unit: '°C', color: '#f97316', icon: Thermometer },
  { key: 'signal_strength', label: 'Signal Strength', unit: 'dBm', color: '#06b6d4', icon: Radio },
  { key: 'altitude', label: 'Altitude', unit: 'km', color: '#10b981', icon: Navigation },
];

interface DetailData {
  spacecraft: Spacecraft;
  telemetry: TelemetryReading[];
  anomalies: Anomaly[];
  health_breakdown: Record<string, number>;
}

function TelemetryChart({ data, field, label, unit, color }: {
  data: TelemetryReading[];
  field: keyof TelemetryReading;
  label: string;
  unit: string;
  color: string;
}) {
  const sampled = data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 60)) === 0);
  const points = sampled.map(r => ({
    time: format(new Date(r.timestamp), 'HH:mm'),
    value: r[field] as number,
  }));

  const vals = points.map(p => p.value);
  const min = vals.length > 0 ? Math.min(...vals) : 0;
  const max = vals.length > 0 ? Math.max(...vals) : 0;

  return (
    <Card>
      <CardHeader
        title={label}
        subtitle={`Current: ${vals[vals.length - 1]?.toFixed(2)} ${unit}`}
        icon={<Activity className="w-3.5 h-3.5" style={{ color }} />}
      />
      <CardBody className="pt-2 pb-3">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 2, right: 4, bottom: 2, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: '#0f1a2e', border: '1px solid #1e2d4a', borderRadius: '6px', fontSize: '11px', color: '#cbd5e1' }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v: number) => [`${v.toFixed(2)} ${unit}`, label]}
              />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-[#1e2d4a]">
          {[
            { l: 'Min', v: min },
            { l: 'Avg', v: vals.reduce((a, b) => a + b, 0) / (vals.length || 1) },
            { l: 'Max', v: max },
          ].map(({ l, v }) => (
            <div key={l} className="text-center">
              <div className="text-[10px] text-slate-500">{l}</div>
              <div className="text-xs font-mono text-slate-300">{v.toFixed(2)}{unit}</div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

export default function SatelliteDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedHours, setSelectedHours] = useState(24);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/satellites/${id}?hours=${selectedHours}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'Spacecraft not found' : `HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load spacecraft data');
    } finally {
      setLoading(false);
    }
  }, [id, selectedHours]);

  const fetchAIExplanation = async () => {
    if (!data) return;
    setAiLoading(true);
    try {
      const anomalyCtx = data.anomalies.length > 0
        ? `The spacecraft has ${data.anomalies.length} active anomaly/anomalies: ${data.anomalies.map(a => a.anomaly_type).join(', ')}.`
        : 'No active anomalies.';

      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `Analyze ${id} current status. Health score is ${data.spacecraft.health_score}%. ${anomalyCtx} Provide a detailed technical assessment and recommended actions.`,
        }),
      });
      const json = await res.json();
      setAiExplanation(json.response);
    } catch {
      setAiExplanation('Unable to generate AI analysis at this time.');
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  if (loading) return (
    <AppShell title="Satellite Detail">
      <LoadingState message={`Loading ${id} data...`} />
    </AppShell>
  );

  if (error || !data) return (
    <AppShell title="Satellite Detail">
      <ErrorState message={error || 'Data unavailable'} onRetry={fetchData} />
    </AppShell>
  );

  const { spacecraft: sc, telemetry, anomalies } = data;
  const latest = telemetry[telemetry.length - 1];

  return (
    <AppShell title={sc.name} subtitle={sc.mission}>
      {/* Back + header */}
      <div className="mb-5">
        <Link href="/satellites" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-4 transition-colors w-fit">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Satellites
        </Link>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold font-mono text-slate-100">{sc.name}</h2>
              <StatusBadge status={sc.status} />
              <span className="text-xs text-slate-500">{sc.orbit_type}</span>
            </div>
            <p className="text-sm text-slate-400 mt-1">{sc.description}</p>
          </div>

          {/* Time range selector */}
          <div className="flex items-center gap-1 bg-[#0f1a2e] border border-[#1e2d4a] rounded-lg p-1">
            {TIME_RANGES.map(tr => (
              <button
                key={tr.value}
                onClick={() => setSelectedHours(tr.hours)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  selectedHours === tr.hours
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tr.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Overview metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
        {[
          { label: 'Health Score', value: `${sc.health_score}%`, color: getHealthBg(sc.health_score) },
          { label: 'Battery', value: latest ? `${latest.battery_voltage.toFixed(1)}V` : 'N/A', color: '#3b82f6' },
          { label: 'Temperature', value: latest ? `${latest.temperature_internal.toFixed(1)}°C` : 'N/A', color: '#f97316' },
          { label: 'Signal', value: latest ? `${latest.signal_strength.toFixed(0)}dBm` : 'N/A', color: '#06b6d4' },
          { label: 'Altitude', value: latest ? `${latest.altitude.toFixed(0)}km` : 'N/A', color: '#10b981' },
          { label: 'Anomalies', value: anomalies.length, color: anomalies.length > 0 ? '#f97316' : '#64748b' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
            <div className="text-lg font-mono font-bold" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Main 3-column grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left: Subsystems + Anomalies */}
        <div className="space-y-5">
          {/* Subsystem health */}
          <Card>
            <CardHeader title="Subsystem Health" icon={<Activity className="w-4 h-4 text-blue-400" />} />
            <CardBody className="space-y-4">
              {sc.subsystems?.map(sub => (
                <div key={sub.name}>
                  <HealthBar
                    score={sub.score}
                    label={sub.name}
                    size="sm"
                  />
                  {sub.details && (
                    <div className="text-[10px] text-slate-500 mt-0.5 font-mono">{sub.details}</div>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>

          {/* Active anomalies */}
          <Card>
            <CardHeader
              title="Active Anomalies"
              subtitle={`${anomalies.length} detected`}
              icon={<AlertTriangle className="w-4 h-4 text-orange-400" />}
            />
            <div className="divide-y divide-[#1e2d4a]">
              {anomalies.length === 0 ? (
                <div className="p-4 text-xs text-slate-500 text-center">No active anomalies</div>
              ) : anomalies.map(a => (
                <div key={a.id} className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={a.severity} />
                    <span className="text-xs text-slate-300 font-medium">
                      {a.anomaly_type.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{a.explanation}</p>
                  <div className="bg-blue-600/5 border border-blue-500/15 rounded-lg p-2">
                    <div className="text-[10px] text-blue-400 font-semibold mb-0.5">ACTION</div>
                    <div className="text-[11px] text-slate-300">{a.recommended_action}</div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(a.timestamp)} · Confidence: {(a.confidence * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Center + Right: Charts */}
        <div className="xl:col-span-2 space-y-4">
          {/* Ground Track Map */}
          <GroundTrackWidget spacecraftLabel={`${sc.name} · NORAD 25544`} />

          {/* Live Physics Simulation */}
          <TelemetrySimPanel spacecraftId={id} />

          {/* AI Explanation */}
          <Card>
            <CardHeader
              title="AI Analysis"
              subtitle="Powered by OrbitGuard AI"
              icon={<Brain className="w-4 h-4 text-blue-400" />}
              actions={
                <button
                  onClick={fetchAIExplanation}
                  disabled={aiLoading}
                  className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors px-2 py-1 rounded hover:bg-blue-600/10"
                >
                  {aiLoading ? 'Analyzing...' : aiExplanation ? 'Regenerate' : 'Generate Analysis'}
                </button>
              }
            />
            <CardBody>
              {aiLoading ? (
                <div className="text-xs text-slate-400 flex items-center gap-2 py-4">
                  <div className="w-3 h-3 border border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  Analyzing spacecraft telemetry...
                </div>
              ) : aiExplanation ? (
                <div
                  className="text-xs text-slate-300 leading-relaxed space-y-2 prose-sm"
                  dangerouslySetInnerHTML={{ __html: aiExplanation
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-100">$1</strong>')
                    .replace(/^(#{1,3} .+)$/gm, '<div class="text-sm font-semibold text-slate-200 mt-2 mb-1">$1</div>')
                    .replace(/\n\n/g, '</p><p class="mt-2">')
                    .replace(/\n/g, '<br/>')
                  }}
                />
              ) : (
                <div className="text-xs text-slate-500 py-2">
                  Click "Generate Analysis" for an AI-powered assessment of this spacecraft's current status.
                </div>
              )}
            </CardBody>
          </Card>

          {/* Telemetry charts grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TELEMETRY_CHARTS.map(chart => (
              <TelemetryChart
                key={chart.key}
                data={telemetry}
                field={chart.key as keyof TelemetryReading}
                label={chart.label}
                unit={chart.unit}
                color={chart.color}
              />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
