'use client';

// ============================================================
// TelemetrySimPanel — Unified Live + Simulation Telemetry Panel
//
// LIVE mode   — streams real ISS (NORAD 25544) data from
//               /api/simulation/live every 2 s via SSE.
//               Shows real lat/lng/altitude/velocity + derived
//               battery/thermal/EPS from actual orbital visibility.
//
// SIM mode    — streams physics engine from /api/simulation/stream
//               every 1 s via SSE with full anomaly injection.
//
// A toggle in the panel header switches between the two modes.
// The parent satellite detail page does not need to change.
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import type { SimTelemetry, AnomalyMode } from '@/lib/telemetry-simulation';
import { usePageTitle } from '@/components/layout/PageTitleContext';
import {
  Activity,
  Battery,
  Thermometer,
  Zap,
  Sun,
  Moon,
  AlertTriangle,
  Play,
  Square,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Cpu,
  Globe,
  Navigation,
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type TelemetryMode = 'simulation' | 'live';

// ── Anomaly definitions (simulation mode only) ────────────────────────────────

const ANOMALY_DEFS: {
  mode: AnomalyMode;
  label: string;
  description: string;
  color: string;
  badge: string;
}[] = [
  {
    mode: 'thermal_runaway',
    label: 'Thermal Runaway',
    description: 'Heater failure → core temp climbs past 55 °C',
    color: 'text-red-400',
    badge: 'bg-red-500/10 border-red-500/30 text-red-400',
  },
  {
    mode: 'solar_occlusion',
    label: 'Solar Occlusion',
    description: 'Array misalignment → solar generation drops 80 %',
    color: 'text-amber-400',
    badge: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  },
  {
    mode: 'battery_degradation',
    label: 'Battery Degradation',
    description: 'Impedance surge → rapid SoC and voltage drop',
    color: 'text-orange-400',
    badge: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
  },
  {
    mode: 'payload_surge',
    label: 'Payload Power Surge',
    description: 'Current spike → consumption exceeds 400 W',
    color: 'text-purple-400',
    badge: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function MiniGauge({
  value, min, max, color, label, unit, decimals = 1,
}: {
  value: number; min: number; max: number;
  color: string; label: string; unit: string; decimals?: number;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
        <span className={cn('text-xs font-mono font-semibold', color)}>
          {value.toFixed(decimals)}{unit}
        </span>
      </div>
      <div className="h-1.5 bg-[#0a1120] rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', color.replace('text-', 'bg-'))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SoCRing({ soc }: { soc: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const filled = circ * (soc / 100);
  const color = soc >= 60 ? '#10b981' : soc >= 35 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="flex-shrink-0">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#1e2d4a" strokeWidth="7" />
      <circle
        cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
        style={{ transition: 'stroke-dasharray 0.7s ease, stroke 0.7s ease' }}
      />
      <text x="44" y="40" textAnchor="middle" fontSize="14" fontWeight="700" fill={color} fontFamily="monospace">
        {soc.toFixed(0)}%
      </text>
      <text x="44" y="54" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="monospace">
        SoC
      </text>
    </svg>
  );
}

function OrbitRing({ progress, phase }: { progress: number; phase: 'sunlight' | 'eclipse' }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const sunFrac = 60 / 90;
  const sunLen = circ * sunFrac;
  const eclLen = circ * (1 - sunFrac);
  const progressFill = circ * (progress / 100);
  const fillColor = phase === 'sunlight' ? '#fbbf24' : '#60a5fa';

  return (
    <svg width="84" height="84" viewBox="0 0 84 84" className="flex-shrink-0">
      <circle cx="42" cy="42" r={r} fill="none" stroke="#1e3a5f" strokeWidth="6"
        strokeDasharray={`${eclLen} ${circ - eclLen}`}
        strokeDashoffset={-sunLen}
        strokeLinecap="butt"
        transform="rotate(-90 42 42)"
      />
      <circle cx="42" cy="42" r={r} fill="none" stroke="#2d4a1e" strokeWidth="6"
        strokeDasharray={`${sunLen} ${circ - sunLen}`}
        strokeLinecap="butt"
        transform="rotate(-90 42 42)"
      />
      <circle cx="42" cy="42" r={r} fill="none" stroke={fillColor} strokeWidth="5" strokeOpacity="0.4"
        strokeDasharray={`${progressFill} ${circ - progressFill}`}
        strokeLinecap="round"
        transform="rotate(-90 42 42)"
        style={{ transition: 'stroke-dasharray 0.9s ease' }}
      />
      <text x="42" y="38" textAnchor="middle" fontSize="7" fill={fillColor} fontFamily="monospace" fontWeight="700">
        {phase === 'sunlight' ? 'SUNLIGHT' : 'ECLIPSE'}
      </text>
      <text x="42" y="50" textAnchor="middle" fontSize="11" fill={fillColor} fontFamily="monospace" fontWeight="700">
        {progress.toFixed(0)}%
      </text>
    </svg>
  );
}

// ── Mode toggle ───────────────────────────────────────────────────────────────

function ModeToggle({
  mode, onChange, disabled,
}: {
  mode: TelemetryMode;
  onChange: (m: TelemetryMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center bg-[#080d1a] border border-[#1e2d4a] rounded-lg p-0.5 gap-0.5">
      <button
        onClick={() => onChange('live')}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold transition-colors disabled:opacity-50',
          mode === 'live'
            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
            : 'text-slate-500 hover:text-slate-300',
        )}
      >
        <span className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          mode === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
        )} />
        LIVE TELEMETRY
      </button>
      <button
        onClick={() => onChange('simulation')}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold transition-colors disabled:opacity-50',
          mode === 'simulation'
            ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
            : 'text-slate-500 hover:text-slate-300',
        )}
      >
        <span className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          mode === 'simulation' ? 'bg-amber-400' : 'bg-slate-600'
        )} />
        SIMULATION
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface TelemetrySimPanelProps {
  spacecraftId: string;
}

export function TelemetrySimPanel({ spacecraftId }: TelemetrySimPanelProps) {
  const [mode, setMode] = useState<TelemetryMode>('simulation');
  const [tel, setTel] = useState<SimTelemetry | null>(null);
  const [running, setRunning] = useState(false);
  const { state: titleState, setTitle } = usePageTitle();
  const [connecting, setConnecting] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [showAnomalyPanel, setShowAnomalyPanel] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── SSE connection ──────────────────────────────────────────────────────────

  const connect = useCallback((currentMode: TelemetryMode) => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    setTel(null);
    setConnecting(true);
    setStreamError(null);

    const url = currentMode === 'live'
      ? '/api/simulation/live'
      : `/api/simulation/stream?id=${spacecraftId}`;

    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('status', (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        setRunning(d.running ?? (currentMode === 'live'));
        setConnecting(false);
      } catch { /* ignore */ }
    });

    es.addEventListener('telemetry', (e: MessageEvent) => {
      try {
        const t = JSON.parse(e.data) as SimTelemetry;
        setTel(t);
        setRunning(true);
        setConnecting(false);
      } catch { /* ignore */ }
    });

    es.onerror = () => {
      setConnecting(false);
      setStreamError('Stream disconnected — reconnecting in 3 s…');
      es.close();
      esRef.current = null;
      reconnectRef.current = setTimeout(() => connect(currentMode), 3000);
    };
  }, [spacecraftId]);

  // Reconnect when mode changes
  useEffect(() => {
    connect(mode);
    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect, mode]);

  const handleModeChange = (m: TelemetryMode) => {
    setMode(m);
    setRunning(false);
    // Push the active data source into TopBar context so the badge updates
    setTitle({
      ...titleState,
      dataSource: m === 'live' ? 'iss-live' : 'simulated',
    });
  };

  // ── Simulation controls (sim mode only) ────────────────────────────────────

  const control = useCallback(async (body: Record<string, unknown>) => {
    setActionPending(true);
    try {
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spacecraft_id: spacecraftId, ...body }),
      });
      const data = await res.json();
      if (data.running !== undefined) setRunning(data.running);
    } catch { /* ignore minor control glitches */ }
    finally { setActionPending(false); }
  }, [spacecraftId]);

  const toggleRunning   = () => control({ action: running ? 'stop' : 'start' });
  const injectAnomaly   = (m: AnomalyMode) => control({ action: 'inject',  anomaly: m });
  const resolveAnomaly  = (m: AnomalyMode) => control({ action: 'resolve', anomaly: m });
  const resolveAll      = () => control({ action: 'resolve_all' });

  // ── Derived state ────────────────────────────────────────────────────────────

  const activeAnomalies = tel?.active_anomalies ?? [];
  const hasAnomalies = activeAnomalies.length > 0;
  const isLive = mode === 'live';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl overflow-hidden">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#1e2d4a]">
        <div className="flex items-center gap-2.5">
          <Activity className={cn('w-4 h-4 flex-shrink-0', isLive ? 'text-emerald-400' : 'text-blue-400')} />
          <div>
            <div className="text-sm font-semibold text-slate-200">
              {isLive ? 'ISS Live Telemetry' : 'Physics Simulation'}
            </div>
            <div className="text-[10px] text-slate-500">
              {isLive
                ? 'Real-time · ISS NORAD 25544 · wheretheiss.at'
                : `1-second physics engine · ${spacecraftId}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode toggle */}
          <ModeToggle mode={mode} onChange={handleModeChange} disabled={connecting} />

          {/* Status dot + tick */}
          <div className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            connecting ? 'bg-amber-400 animate-pulse' :
            running    ? (isLive ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400 animate-pulse') :
                         'bg-slate-600'
          )} />
          <span className="text-[10px] text-slate-500 font-mono min-w-[52px]">
            {connecting ? 'Connecting' : running ? (isLive ? 'LIVE' : `T+${tel?.tick ?? 0}s`) : 'Idle'}
          </span>

          {/* Sim-only: start/stop */}
          {!isLive && (
            <button
              onClick={toggleRunning}
              disabled={actionPending || connecting}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50',
                running
                  ? 'text-red-300 bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
                  : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
              )}
            >
              {running ? <><Square className="w-3 h-3" />Stop</> : <><Play className="w-3 h-3" />Start</>}
            </button>
          )}

          {/* Reconnect */}
          <button
            onClick={() => connect(mode)}
            title="Reconnect stream"
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-[#1e2d4a] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Live source banner ── */}
      {isLive && !connecting && (
        <div className="px-4 py-1.5 bg-emerald-500/5 border-b border-emerald-500/15 flex items-center gap-2">
          <Radio className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          <span className="text-[10px] text-emerald-400 font-medium">
            LIVE · ISS (NORAD 25544) · wheretheiss.at
          </span>
          <span className="text-[10px] text-slate-500 ml-auto">
            Battery &amp; thermal derived from real orbital visibility
          </span>
        </div>
      )}

      {/* ── Stream error ── */}
      {streamError && (
        <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/20 text-[11px] text-amber-400">
          {streamError}
        </div>
      )}

      {/* ── Active anomaly banner (sim mode only) ── */}
      {!isLive && hasAnomalies && (
        <div className="px-4 py-2 bg-red-500/5 border-b border-red-500/20 flex flex-wrap gap-2 items-center">
          {activeAnomalies.map(m => {
            const def = ANOMALY_DEFS.find(d => d.mode === m);
            return (
              <div key={m} className="flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />
                <span className="text-[10px] text-red-400 font-medium">{def?.label ?? m}</span>
                <button onClick={() => resolveAnomaly(m)}
                  className="text-[9px] text-slate-500 hover:text-slate-300 border border-slate-700 rounded px-1 py-0.5 ml-1 transition-colors">
                  Resolve
                </button>
              </div>
            );
          })}
          <button onClick={resolveAll}
            className="text-[9px] text-slate-400 hover:text-slate-200 border border-[#1e2d4a] rounded px-2 py-0.5 ml-auto transition-colors">
            Clear all
          </button>
        </div>
      )}

      {/* ── Waiting state ── */}
      {!tel ? (
        <div className="p-6 text-center text-xs text-slate-500">
          {connecting
            ? (isLive ? 'Connecting to ISS live telemetry…' : 'Connecting to telemetry stream…')
            : (isLive ? 'Fetching live ISS data…' : 'Start the simulation to see live telemetry.')}
        </div>
      ) : (
        <div className="p-4 space-y-4">

          {/* ── Live ISS position row (live mode only) ── */}
          {isLive && tel.iss_latitude !== undefined && (
            <div className="bg-[#080d1a] border border-[#1e2d4a] rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-3">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                  Real-time ISS Position
                </span>
                <span className="ml-auto text-[10px] text-emerald-400 font-mono font-semibold">LIVE</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    label: 'Latitude',
                    value: `${tel.iss_latitude!.toFixed(4)}°`,
                    icon: <Navigation className="w-3 h-3 text-slate-500" />,
                    color: 'text-slate-200',
                  },
                  {
                    label: 'Longitude',
                    value: `${tel.iss_longitude!.toFixed(4)}°`,
                    icon: <Navigation className="w-3 h-3 text-slate-500" />,
                    color: 'text-slate-200',
                  },
                  {
                    label: 'Altitude',
                    value: `${tel.iss_altitude_km!.toFixed(1)} km`,
                    icon: <Activity className="w-3 h-3 text-blue-400" />,
                    color: 'text-blue-400',
                  },
                  {
                    label: 'Velocity',
                    value: `${(tel.iss_velocity_kph! / 3.6).toFixed(2)} km/s`,
                    icon: <Zap className="w-3 h-3 text-amber-400" />,
                    color: 'text-amber-400',
                  },
                ].map(({ label, value, icon, color }) => (
                  <div key={label} className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-lg p-2.5">
                    <div className="flex items-center gap-1 mb-1">
                      {icon}
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</span>
                    </div>
                    <div className={cn('text-sm font-mono font-bold', color)}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Sub-solar / footprint row */}
              {tel.iss_solar_lat !== undefined && (
                <div className="grid grid-cols-3 gap-3 mt-3">
                  {[
                    { label: 'Solar Lat', value: `${tel.iss_solar_lat.toFixed(2)}°` },
                    { label: 'Solar Lng', value: `${tel.iss_solar_lng!.toFixed(2)}°` },
                    { label: 'Footprint', value: `${tel.iss_footprint_km} km` },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between text-[10px] bg-[#0f1a2e] border border-[#1e2d4a] rounded px-2 py-1.5">
                      <span className="text-slate-500">{label}</span>
                      <span className="text-slate-300 font-mono">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Row: Orbital + Battery ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Orbital cycle */}
            <div className="bg-[#080d1a] border border-[#1e2d4a] rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-3">
                {tel.orbital_phase === 'sunlight'
                  ? <Sun  className="w-3.5 h-3.5 text-amber-400" />
                  : <Moon className="w-3.5 h-3.5 text-blue-400" />
                }
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                  Orbital Cycle
                  {isLive && <span className="ml-1 text-emerald-400 font-semibold">· REAL</span>}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <OrbitRing progress={tel.orbital_progress_pct} phase={tel.orbital_phase} />
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Phase</span>
                    <span className={tel.orbital_phase === 'sunlight' ? 'text-amber-400 font-semibold' : 'text-blue-400 font-semibold'}>
                      {tel.orbital_phase === 'sunlight' ? '☀ Sunlight' : '🌑 Eclipse'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Elapsed</span>
                    <span className="text-slate-300 font-mono">{tel.time_in_phase_s}s</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Remaining</span>
                    <span className="text-slate-300 font-mono">{tel.remaining_in_phase_s}s</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Period</span>
                    <span className="text-slate-300 font-mono">{isLive ? '~92 min' : '90 s'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Battery */}
            <div className="bg-[#080d1a] border border-[#1e2d4a] rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-3">
                <Battery className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Battery / EPS</span>
                {isLive && <span className="ml-1 text-[10px] text-slate-600">(derived)</span>}
              </div>
              <div className="flex items-center gap-4">
                <SoCRing soc={tel.battery_soc_pct} />
                <div className="space-y-2 flex-1 min-w-0">
                  <MiniGauge
                    label="Voltage" value={tel.battery_voltage_v}
                    min={24} max={32} unit="V"
                    color={tel.battery_voltage_v < 25.5 ? 'text-red-400' : 'text-blue-400'}
                  />
                  <MiniGauge
                    label="Current" value={tel.battery_current_a}
                    min={-7} max={5.5} unit="A"
                    color={tel.battery_current_a >= 0 ? 'text-emerald-400' : 'text-orange-400'}
                  />
                  <div className="flex justify-between text-[10px] mt-1">
                    <span className="text-slate-500">Batt Temp</span>
                    <span className={cn('font-mono', tel.battery_temp_c > 40 ? 'text-red-400' : 'text-slate-300')}>
                      {tel.battery_temp_c.toFixed(1)}°C
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Row: Thermal + Power ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Thermal */}
            <div className="bg-[#080d1a] border border-[#1e2d4a] rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-3">
                <Thermometer className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Thermal</span>
                {isLive && <span className="ml-1 text-[10px] text-slate-600">(derived)</span>}
              </div>
              <div className="space-y-3">
                <MiniGauge
                  label="Core Avionics" value={tel.core_temp_c}
                  min={-10} max={70} unit="°C"
                  color={tel.core_temp_c > 50 ? 'text-red-400' : tel.core_temp_c > 38 ? 'text-amber-400' : 'text-orange-400'}
                />
                <MiniGauge
                  label="Solar Array" value={tel.solar_array_temp_c}
                  min={-90} max={120} unit="°C"
                  color={tel.orbital_phase === 'sunlight' ? 'text-amber-400' : 'text-blue-400'}
                />
                <MiniGauge
                  label="Payload" value={tel.payload_temp_c}
                  min={15} max={50} unit="°C"
                  color={tel.payload_temp_c > 42 ? 'text-red-400' : 'text-emerald-400'}
                />
                {tel.core_temp_c > 50 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-red-400 bg-red-500/5 border border-red-500/20 rounded px-2 py-1">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    Core temp exceeds 50 °C threshold
                  </div>
                )}
              </div>
            </div>

            {/* Power / EPS */}
            <div className="bg-[#080d1a] border border-[#1e2d4a] rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-3">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Power / EPS</span>
                {isLive && <span className="ml-1 text-[10px] text-slate-600">(derived)</span>}
              </div>
              <div className="space-y-3">
                <MiniGauge
                  label="Solar Generation" value={tel.solar_generation_w}
                  min={0} max={500} unit="W"
                  color={tel.solar_generation_w > 200 ? 'text-amber-400' : 'text-slate-500'}
                />
                <MiniGauge
                  label="Consumption" value={tel.power_consumption_w}
                  min={0} max={500} unit="W"
                  color={tel.power_consumption_w > 380 ? 'text-red-400' : tel.power_consumption_w > 260 ? 'text-amber-400' : 'text-emerald-400'}
                />
                <MiniGauge
                  label="Bus Voltage" value={tel.eps_bus_voltage_v}
                  min={27} max={29.5} unit="V" decimals={2}
                  color={Math.abs(tel.eps_bus_voltage_v - 28.0) > 0.4 ? 'text-amber-400' : 'text-emerald-400'}
                />
                {tel.power_consumption_w > 380 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-purple-400 bg-purple-500/5 border border-purple-500/20 rounded px-2 py-1">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    Consumption approaching 400 W surge threshold
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Anomaly injection (simulation mode only) ── */}
          {!isLive && (
            <div className="bg-[#080d1a] border border-[#1e2d4a] rounded-xl overflow-hidden">
              <button
                onClick={() => setShowAnomalyPanel(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[#0f1a2e] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    Failure Mode Injection
                  </span>
                  {hasAnomalies && (
                    <span className="text-[9px] bg-red-500/20 border border-red-500/30 text-red-400 rounded px-1.5 py-0.5">
                      {activeAnomalies.length} active
                    </span>
                  )}
                </div>
                {showAnomalyPanel
                  ? <ChevronUp   className="w-3.5 h-3.5 text-slate-500" />
                  : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                }
              </button>

              {showAnomalyPanel && (
                <div className="border-t border-[#1e2d4a] divide-y divide-[#1e2d4a]">
                  {ANOMALY_DEFS.map(def => {
                    const active = activeAnomalies.includes(def.mode);
                    return (
                      <div
                        key={def.mode}
                        className={cn('flex items-center justify-between px-3 py-2.5 gap-3', active && 'bg-[#120d1e]')}
                      >
                        <div className="min-w-0">
                          <div className={cn('text-xs font-medium leading-snug', def.color)}>{def.label}</div>
                          <div className="text-[10px] text-slate-500 leading-snug mt-0.5 truncate">{def.description}</div>
                        </div>
                        <button
                          onClick={() => active ? resolveAnomaly(def.mode) : injectAnomaly(def.mode)}
                          disabled={actionPending}
                          className={cn(
                            'flex-shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50',
                            active
                              ? 'text-slate-300 bg-[#1e2d4a] border-[#2a3d5e] hover:bg-[#243352]'
                              : cn(def.badge, 'hover:opacity-80')
                          )}
                        >
                          {active ? 'Resolve' : 'Inject'}
                        </button>
                      </div>
                    );
                  })}
                  {hasAnomalies && (
                    <div className="px-3 py-2">
                      <button
                        onClick={resolveAll}
                        disabled={actionPending}
                        className="text-[10px] text-slate-400 hover:text-slate-200 border border-[#1e2d4a] rounded-lg px-3 py-1 transition-colors disabled:opacity-50"
                      >
                        Resolve all anomalies
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Live mode disclaimer ── */}
          {isLive && (
            <div className="text-[10px] text-slate-600 text-center px-2">
              Position: real ISS data · Battery, thermal &amp; EPS: physically derived from real orbital sunlight/eclipse state
            </div>
          )}

        </div>
      )}
    </div>
  );
}
