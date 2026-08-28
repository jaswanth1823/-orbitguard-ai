'use client';

// ============================================================
// GroundTrackWidget
//
// Real-time satellite ground track with:
//  • 2D equirectangular SVG world map (pure SVG, no libs)
//  • Animated day/night terminator computed from solar position
//  • Live satellite icon with animated glow at real lat/lng
//  • Trailing orbit path (last 40 positions)
//  • Coordinate readout: lat, lng, altitude, velocity (km/h)
//  • Time-to-eclipse / time-to-sunrise countdown with arc progress
//  • "Reconnecting to live ground station…" banner with retry
//  • Seamless fallback — never crashes on API errors
//
// Data source: GET /api/groundtrack (SSE, 2 s cadence)
// No external map libraries required.
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Globe,
  Navigation,
  ArrowUpDown,
  Gauge,
  Sun,
  Moon,
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GroundTrackSnapshot {
  latitude:          number;   // deg
  longitude:         number;   // deg
  altitude_km:       number;
  velocity_kph:      number;
  visibility:        'daylight' | 'eclipsed';
  solar_lat:         number;   // sub-solar point latitude
  solar_lng:         number;   // sub-solar point longitude
  footprint_km:      number;
  remaining_phase_s: number;   // seconds remaining in current phase
  orbital_phase:     'sunlight' | 'eclipse';
  timestamp:         string;
}

// ── Map constants ─────────────────────────────────────────────────────────────

const MAP_W = 720;
const MAP_H = 360;

// ISS average orbital period segments
const ISS_SUNLIGHT_S = 3600; // ~60 min sunlight
const ISS_ECLIPSE_S  = 1860; // ~31 min eclipse

// ── Map geometry helpers ──────────────────────────────────────────────────────

/** Convert geographic coords to SVG pixel coords (equirectangular) */
function geoToSvg(lat: number, lng: number, W: number, H: number): [number, number] {
  const x = ((lng + 180) / 360) * W;
  const y = ((90 - lat) / 180) * H;
  return [x, y];
}

/**
 * Build the night-side overlay as two SVG path segments — one for the left half,
 * one for the right half — so antimeridian wrapping never causes a diagonal stroke.
 *
 * Strategy:
 *   1. Compute 360 terminator points in geo space.
 *   2. Project to SVG pixels.
 *   3. Split into two sub-polylines if any segment jumps > W/2 pixels horizontally
 *      (antimeridian crossing). Each sub-polyline is closed on the appropriate edge.
 */
function buildNightPaths(solarLat: number, solarLng: number, W: number, H: number): string[] {
  const DEG = Math.PI / 180;
  const sLat = solarLat * DEG;
  const sLng = solarLng * DEG;

  const STEPS = 360;
  const geo: [number, number][] = [];

  for (let i = 0; i <= STEPS; i++) {
    const theta = (i / STEPS) * 2 * Math.PI;
    const latT  = Math.asin(-Math.cos(theta) * Math.cos(sLat));
    const lngT  = sLng + Math.atan2(Math.sin(theta), Math.sin(sLat) * Math.cos(theta));
    const latDeg = latT / DEG;
    // Normalise longitude to [-180, 180]
    const lngDeg = ((lngT / DEG) + 540) % 360 - 180;
    geo.push([latDeg, lngDeg]);
  }

  // Project to SVG
  const svgPts: [number, number][] = geo.map(([lat, lng]) => geoToSvg(lat, lng, W, H));

  // Detect antimeridian wrap: consecutive x points that jump more than half the map width
  const segments: [number, number][][] = [];
  let current: [number, number][] = [];

  for (let i = 0; i < svgPts.length; i++) {
    if (i > 0) {
      const dx = Math.abs(svgPts[i][0] - svgPts[i - 1][0]);
      if (dx > W / 2) {
        // Antimeridian jump — end current segment, start new one
        if (current.length > 1) segments.push(current);
        current = [];
      }
    }
    current.push(svgPts[i]);
  }
  if (current.length > 1) segments.push(current);

  if (segments.length === 0) return [];

  // Night side: close each segment towards the south (if sun is N) or north (if sun is S)
  const closingY = solarLat >= 0 ? H : 0;

  return segments.map(seg => {
    const first = seg[0];
    const last  = seg[seg.length - 1];
    const pts = seg.map(([x, y], i) =>
      `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    );
    pts.push(`L ${last[0].toFixed(1)} ${closingY}`);
    pts.push(`L ${first[0].toFixed(1)} ${closingY}`);
    pts.push('Z');
    return pts.join(' ');
  });
}

/**
 * Build only the terminator line points (for the golden edge stroke).
 * Split at antimeridian like above so the stroke doesn't wrap diagonally.
 */
function buildTerminatorLines(solarLat: number, solarLng: number, W: number, H: number): string[] {
  const DEG = Math.PI / 180;
  const sLat = solarLat * DEG;
  const sLng = solarLng * DEG;

  const STEPS = 360;
  const svgPts: [number, number][] = [];

  for (let i = 0; i <= STEPS; i++) {
    const theta = (i / STEPS) * 2 * Math.PI;
    const latT  = Math.asin(-Math.cos(theta) * Math.cos(sLat));
    const lngT  = sLng + Math.atan2(Math.sin(theta), Math.sin(sLat) * Math.cos(theta));
    const latDeg = latT / DEG;
    const lngDeg = ((lngT / DEG) + 540) % 360 - 180;
    svgPts.push(geoToSvg(latDeg, lngDeg, W, H));
  }

  const segments: [number, number][][] = [];
  let current: [number, number][] = [];
  for (let i = 0; i < svgPts.length; i++) {
    if (i > 0 && Math.abs(svgPts[i][0] - svgPts[i - 1][0]) > W / 2) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
    current.push(svgPts[i]);
  }
  if (current.length > 1) segments.push(current);

  return segments.map(seg =>
    seg.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  );
}

// ── Coastline data ────────────────────────────────────────────────────────────
// Simplified but recognisable world coastlines encoded as [lng, lat] polygon arrays.
// Accuracy ~100–150 km — sufficient for a real-time satellite tracker.

const COAST_POLYS: [number, number][][] = [
  // ── North America ──
  [
    [-168,72],[-155,72],[-140,72],[-128,72],[-115,74],[-100,72],[-85,72],[-75,73],
    [-65,68],[-60,64],[-55,58],[-54,50],[-56,47],[-60,47],[-66,45],[-70,44],[-74,41],
    [-76,38],[-77,35],[-80,32],[-82,30],[-85,30],[-88,30],[-90,29],[-90,30],[-93,30],
    [-97,26],[-97,22],[-95,19],[-90,16],[-84,10],[-80,9],[-78,9],[-78,8],[-77,7],
    [-79,8],[-82,10],[-84,11],[-86,13],[-88,16],[-90,18],[-92,18],[-96,19],[-98,22],
    [-105,22],[-108,27],[-110,24],[-115,30],[-118,34],[-120,37],[-123,39],[-125,48],
    [-125,50],[-126,52],[-130,56],[-136,58],[-142,60],[-148,60],[-155,60],[-160,59],
    [-162,56],[-165,62],[-168,63],[-168,66],[-168,72]
  ],
  // Great Lakes region (approximate)
  [[-80,44],[-76,44],[-76,43],[-80,43],[-82,42],[-83,42],[-83,44],[-80,44]],
  // Baja California
  [[-117,32],[-115,30],[-110,24],[-110,23],[-114,28],[-117,32]],
  // ── Greenland ──
  [
    [-52,83],[-30,83],[-18,77],[-20,72],[-26,68],[-30,65],[-38,65],[-44,60],
    [-48,62],[-54,67],[-54,72],[-50,78],[-52,83]
  ],
  // ── South America ──
  [
    [-78,11],[-75,9],[-72,10],[-68,12],[-62,12],[-60,8],[-58,6],[-52,4],
    [-50,2],[-50,-1],[-45,-1],[-40,-3],[-36,-5],[-35,-8],[-35,-10],[-37,-12],
    [-40,-18],[-41,-22],[-42,-22],[-44,-24],[-48,-28],[-50,-30],[-52,-34],[-55,-36],
    [-57,-38],[-62,-38],[-66,-38],[-66,-40],[-62,-40],[-62,-42],[-64,-42],[-66,-44],
    [-65,-46],[-66,-50],[-65,-52],[-66,-54],[-68,-53],[-70,-52],[-72,-50],[-72,-46],
    [-70,-44],[-70,-38],[-70,-32],[-72,-28],[-72,-20],[-70,-14],[-72,-12],[-76,-10],
    [-78,-2],[-80,0],[-80,2],[-78,4],[-78,8],[-78,11]
  ],
  // ── Europe ──
  // Iberia
  [[-8,44],[-2,44],[4,44],[4,42],[2,40],[0,38],[-2,37],[-6,37],[-9,37],[-9,39],[-8,44]],
  // France + central Europe
  [[-2,48],[2,50],[4,52],[8,55],[10,56],[14,54],[18,56],[22,56],[26,52],[28,48],
   [26,44],[22,42],[18,40],[16,38],[14,38],[12,38],[10,44],[6,44],[4,46],[2,48]],
  // Italy
  [[10,44],[14,44],[16,42],[16,40],[16,38],[14,38],[12,38],[10,40],[10,44]],
  // Scandinavia
  [[4,58],[8,58],[10,58],[14,56],[18,58],[20,60],[22,62],[24,64],[26,68],[28,70],
   [26,72],[22,74],[18,70],[16,68],[14,66],[10,62],[6,60],[4,58]],
  // UK + Ireland
  [[-6,52],[-4,54],[-2,56],[0,58],[2,58],[2,56],[0,52],[-2,50],[-4,50],[-6,50],
   [-5,52],[-4,54],[-6,54],[-6,52]],
  // ── Africa ──
  [
    [-16,20],[-13,12],[-12,8],[-8,5],[0,5],[4,4],[8,4],[10,5],[12,4],[14,4],[16,0],
    [16,-4],[18,-8],[20,-12],[22,-16],[24,-20],[26,-24],[28,-26],[30,-24],[32,-20],
    [34,-16],[36,-12],[38,-8],[40,-4],[42,0],[44,4],[46,8],[46,12],[44,16],[42,18],
    [40,22],[36,24],[32,28],[32,32],[30,36],[28,36],[24,38],[20,37],[16,38],[14,36],
    [10,38],[6,36],[2,34],[0,30],[-4,26],[-8,22],[-14,20],[-16,20]
  ],
  // Madagascar
  [[44,-12],[46,-14],[50,-18],[50,-22],[48,-25],[44,-25],[44,-22],[42,-16],[44,-12]],
  // ── Middle East & Arabian Peninsula ──
  [[36,22],[36,28],[32,30],[34,30],[36,28],[38,22],[42,16],[44,12],[48,10],[52,14],
   [56,24],[60,22],[58,18],[56,14],[50,12],[46,12],[44,14],[40,20],[36,22]],
  // ── Asia ──
  // Russia / Siberia
  [[28,56],[34,52],[38,48],[42,44],[46,44],[50,44],[54,48],[58,52],[62,56],
   [68,58],[74,60],[80,62],[86,64],[92,66],[98,68],[104,68],[110,70],[116,72],
   [120,72],[124,70],[128,68],[130,62],[136,60],[140,56],[140,52],[136,46],
   [132,42],[130,44],[134,46],[136,48],[140,52],[140,56],[136,60]],
  // East Asia coast
  [[120,22],[118,20],[116,18],[114,22],[116,26],[118,30],[120,32],[120,36],
   [122,38],[124,38],[126,40],[128,40],[130,42],[132,44],[136,46],[138,46]],
  // Indian subcontinent
  [[62,22],[64,22],[68,22],[72,22],[76,20],[78,10],[80,8],[82,8],[84,14],[86,20],
   [88,22],[90,22],[90,20],[92,18],[94,16],[96,16],[96,20],[100,16],[104,10],
   [100,2],[102,0],[104,0],[104,2],[100,2],[96,4],[90,14],[88,18],[84,20],
   [80,14],[76,8],[74,10],[72,18],[70,22],[66,22],[62,22]],
  // Southeast Asia mainland
  [[100,20],[100,16],[102,14],[104,12],[104,10],[100,4],[100,2],[104,0],[108,2],
   [112,4],[116,8],[118,12],[120,18],[122,22],[120,22],[118,20],[116,22],[112,22],
   [108,20],[106,18],[104,16],[102,18],[100,20]],
  // Japan
  [[130,32],[132,34],[134,36],[136,36],[138,38],[140,40],[142,44],[142,42],
   [140,40],[138,36],[136,34],[134,32],[132,32],[130,32]],
  // Korean Peninsula
  [[124,34],[126,36],[128,38],[128,36],[126,34],[124,34]],
  // ── Australia ──
  [
    [114,-22],[118,-20],[122,-18],[126,-16],[130,-14],[136,-12],[138,-12],[140,-16],
    [142,-18],[144,-22],[148,-26],[152,-28],[154,-32],[152,-36],[148,-38],[144,-38],
    [140,-36],[138,-36],[136,-38],[132,-36],[128,-34],[122,-34],[116,-34],[114,-32],
    [112,-28],[114,-26],[114,-22]
  ],
  // New Zealand (North + South Islands rough)
  [[174,-36],[176,-38],[178,-40],[178,-42],[174,-44],[170,-44],[168,-46],[168,-44],
   [170,-42],[172,-40],[174,-38],[174,-36]],
  [[172,-40],[170,-42],[168,-44],[166,-46],[166,-44],[168,-42],[170,-40],[172,-40]],
  // ── Southeast Asian Islands ──
  // Sumatra
  [[96,6],[98,4],[100,2],[104,0],[106,-2],[106,-4],[104,-4],[100,-2],[98,2],[96,4],[96,6]],
  // Java
  [[106,-6],[108,-6],[110,-8],[112,-8],[114,-8],[114,-6],[112,-6],[110,-6],[108,-6],[106,-6]],
  // Borneo
  [[108,2],[110,4],[114,4],[116,6],[118,6],[118,4],[116,2],[114,0],[110,0],[108,2]],
  // Philippines rough
  [[120,18],[122,16],[124,14],[122,12],[120,10],[118,10],[118,12],[120,14],[120,18]],
  // Sri Lanka
  [[80,8],[82,8],[82,6],[80,6],[80,8]],
  // ── Antarctica ──
  [
    [-180,-70],[-160,-72],[-140,-74],[-120,-72],[-100,-72],[-80,-74],[-60,-72],
    [-40,-70],[-20,-72],[0,-72],[20,-72],[40,-72],[60,-70],[80,-72],[100,-74],
    [120,-72],[140,-74],[160,-72],[180,-70],[180,-90],[-180,-90],[-180,-70]
  ],
];

function buildCoastlinePath(W: number, H: number): string {
  return COAST_POLYS.map(poly =>
    poly.map(([lng, lat], i) => {
      const [x, y] = geoToSvg(lat, lng, W, H);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ') + ' Z'
  ).join(' ');
}

// ── Countdown formatter ───────────────────────────────────────────────────────

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── SVG arc helper for phase progress ────────────────────────────────────────

/**
 * Describes an SVG arc path.
 * cx, cy = centre; r = radius; startAngle, endAngle in degrees (0 = right, CW)
 */
function svgArcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const sweep = (endDeg - startDeg + 360) % 360 > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${sweep} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

// ── Trail buffer ──────────────────────────────────────────────────────────────

const TRAIL_MAX = 40;

// ── Main widget ───────────────────────────────────────────────────────────────

interface GroundTrackWidgetProps {
  /** Which spacecraft to label — purely cosmetic */
  spacecraftLabel?: string;
}

export function GroundTrackWidget({ spacecraftLabel = 'ISS · NORAD 25544' }: GroundTrackWidgetProps) {
  const [pos, setPos]             = useState<GroundTrackSnapshot | null>(null);
  const [trail, setTrail]         = useState<[number, number][]>([]);   // [svgX, svgY] history
  const [status, setStatus]       = useState<'connecting' | 'live' | 'error' | 'reconnecting'>('connecting');
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  // elapsed seconds since last snapshot arrived — drives local countdown decrement
  const [elapsed, setElapsed]     = useState(0);

  const esRef           = useRef<EventSource | null>(null);
  const reconnectRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapAt      = useRef<number>(0);  // ms epoch of last position event
  const coastPath       = useRef<string>('');

  // Pre-compute coastline path once
  if (!coastPath.current) {
    coastPath.current = buildCoastlinePath(MAP_W, MAP_H);
  }

  // ── SSE connection ────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
    setStatus('connecting');
    setErrorMsg(null);

    const es = new EventSource('/api/groundtrack');
    esRef.current = es;

    es.addEventListener('status', () => {
      setStatus('connecting');
    });

    es.addEventListener('position', (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as GroundTrackSnapshot;
        setPos(d);
        setStatus('live');
        setErrorMsg(null);
        lastSnapAt.current = Date.now();
        setElapsed(0);
        // Append to trail
        const [sx, sy] = geoToSvg(d.latitude, d.longitude, MAP_W, MAP_H);
        setTrail(prev => {
          const next = [...prev, [sx, sy] as [number, number]];
          return next.length > TRAIL_MAX ? next.slice(next.length - TRAIL_MAX) : next;
        });
      } catch { /* ignore malformed */ }
    });

    es.addEventListener('error', (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        setErrorMsg(d.message ?? 'Ground station unreachable');
        setStatus('error');
      } catch { /* ignore */ }
    });

    es.onerror = () => {
      setStatus('reconnecting');
      setErrorMsg('Reconnecting to live ground station…');
      es.close();
      esRef.current = null;
      reconnectRef.current = setTimeout(() => connect(), 5000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect]);

  // ── Local 1-second ticker for countdown animation ─────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (lastSnapAt.current > 0) {
        setElapsed(Math.floor((Date.now() - lastSnapAt.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Computed values ───────────────────────────────────────────────────────

  const [satX, satY] = pos
    ? geoToSvg(pos.latitude, pos.longitude, MAP_W, MAP_H)
    : [MAP_W / 2, MAP_H / 2];

  const nightPaths     = pos ? buildNightPaths(pos.solar_lat, pos.solar_lng, MAP_W, MAP_H) : [];
  const terminatorLines = pos ? buildTerminatorLines(pos.solar_lat, pos.solar_lng, MAP_W, MAP_H) : [];

  // True remaining seconds (server value minus local elapsed time since last snap)
  const remainingS = pos ? Math.max(0, pos.remaining_phase_s - elapsed) : 0;

  const inSunlight = pos?.orbital_phase === 'sunlight';

  // Phase progress percentage (0-100) for the arc indicator
  const phaseTotalS   = inSunlight ? ISS_SUNLIGHT_S : ISS_ECLIPSE_S;
  const timeInPhaseS  = phaseTotalS - remainingS;
  const progressPct   = Math.min(100, Math.max(0, (timeInPhaseS / phaseTotalS) * 100));

  const velKmh  = pos ? pos.velocity_kph.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
  const velKms  = pos ? (pos.velocity_kph / 3.6).toFixed(2) : '—';

  const isLive  = status === 'live';
  const isError = status === 'error' || status === 'reconnecting';

  // Arc geometry for phase progress indicator (inside the countdown card)
  const ARC_CX = 22; const ARC_CY = 22; const ARC_R = 16;
  const arcStart  = -90; // top
  const arcEnd    = arcStart + (progressPct / 100) * 360;
  const arcPath   = svgArcPath(ARC_CX, ARC_CY, ARC_R, arcStart, arcEnd);

  return (
    <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2d4a]">
        <div className="flex items-center gap-2.5">
          <Globe className={cn('w-4 h-4 flex-shrink-0', isLive ? 'text-emerald-400' : 'text-slate-500')} />
          <div>
            <div className="text-sm font-semibold text-slate-200">Satellite Ground Track</div>
            <div className="text-[10px] text-slate-500">{spacecraftLabel}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Phase badge */}
          {pos && (
            <div className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold',
              inSunlight
                ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                : 'bg-blue-500/10 border-blue-500/25 text-blue-400'
            )}>
              {inSunlight ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
              {inSunlight ? 'Sunlight' : 'Eclipse'}
            </div>
          )}

          {/* Connection indicator */}
          <div className="flex items-center gap-1.5">
            {isError
              ? <WifiOff className="w-3.5 h-3.5 text-red-400" />
              : <Wifi className={cn('w-3.5 h-3.5', isLive ? 'text-emerald-400' : 'text-amber-400')} />
            }
            <span className={cn('text-[10px] font-medium',
              isLive  ? 'text-emerald-400' :
              isError ? 'text-red-400'     : 'text-amber-400'
            )}>
              {status === 'connecting'   ? 'Connecting…'  :
               status === 'live'         ? 'Live'          :
               status === 'reconnecting' ? 'Reconnecting…' : 'Error'}
            </span>
          </div>

          {/* Manual reconnect */}
          <button
            onClick={connect}
            title="Reconnect"
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-[#1e2d4a] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Error / reconnecting banner ── */}
      {isError && (
        <div className="px-4 py-2.5 bg-red-500/5 border-b border-red-500/20 flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
          <span className="text-[11px] text-red-400 font-medium">
            {errorMsg ?? 'Reconnecting to live ground station…'}
          </span>
          <button
            onClick={connect}
            className="ml-auto flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 border border-[#1e2d4a] rounded px-2 py-0.5 transition-colors"
          >
            <RefreshCw className="w-2.5 h-2.5" /> Retry
          </button>
        </div>
      )}

      {/* ── World map ── */}
      <div className="relative bg-[#06101e] overflow-hidden" style={{ aspectRatio: '2 / 1' }}>
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full"
          aria-label="Satellite ground track map"
        >
          {/* Definitions */}
          <defs>
            {/* Satellite glow filter */}
            <filter id="sat-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Soft glow for sub-solar point */}
            <filter id="solar-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Clip to map bounds */}
            <clipPath id="map-clip">
              <rect width={MAP_W} height={MAP_H} />
            </clipPath>
          </defs>

          {/* Ocean background */}
          <rect width={MAP_W} height={MAP_H} fill="#06101e" />

          {/* Night-side shadow — split segments for antimeridian safety */}
          <g clipPath="url(#map-clip)">
            {nightPaths.map((d, i) => (
              <path key={i} d={d} fill="rgba(0,0,0,0.48)" stroke="none" />
            ))}
          </g>

          {/* Coastlines / landmasses */}
          <path
            d={coastPath.current}
            fill="#0d2040"
            stroke="#1e3a56"
            strokeWidth="0.7"
            strokeLinejoin="round"
            clipPath="url(#map-clip)"
          />

          {/* Lat/Lng grid lines */}
          {[-60, -30, 0, 30, 60].map(lat => {
            const [, y] = geoToSvg(lat, 0, MAP_W, MAP_H);
            return (
              <line key={`lat${lat}`}
                x1={0} y1={y} x2={MAP_W} y2={y}
                stroke="#1e2d4a" strokeWidth={lat === 0 ? 0.7 : 0.35}
                strokeDasharray={lat === 0 ? 'none' : '3,8'}
                opacity={lat === 0 ? 0.6 : 0.4}
              />
            );
          })}
          {[-120, -60, 0, 60, 120].map(lng => {
            const [x] = geoToSvg(0, lng, MAP_W, MAP_H);
            return (
              <line key={`lng${lng}`}
                x1={x} y1={0} x2={x} y2={MAP_H}
                stroke="#1e2d4a" strokeWidth={lng === 0 ? 0.7 : 0.35}
                strokeDasharray={lng === 0 ? 'none' : '3,8'}
                opacity={lng === 0 ? 0.6 : 0.4}
              />
            );
          })}

          {/* Terminator line (luminous edge) — split at antimeridian */}
          {terminatorLines.map((d, i) => (
            <path key={i}
              d={d}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.4"
              strokeOpacity="0.55"
              strokeDasharray="5,4"
              clipPath="url(#map-clip)"
            />
          ))}

          {/* Sub-solar point marker */}
          {pos && (() => {
            const [sx, sy] = geoToSvg(pos.solar_lat, pos.solar_lng, MAP_W, MAP_H);
            return (
              <g filter="url(#solar-glow)">
                <circle cx={sx} cy={sy} r={7} fill="rgba(251,191,36,0.10)" stroke="none" />
                <circle cx={sx} cy={sy} r={3} fill="#fbbf24" opacity="0.85" />
              </g>
            );
          })()}

          {/* Footprint ellipse */}
          {pos && (() => {
            const radiusDeg = (pos.footprint_km / 2) / 111;
            const radiusPx  = (radiusDeg / 180) * MAP_H;
            const [fx, fy]  = geoToSvg(pos.latitude, pos.longitude, MAP_W, MAP_H);
            return (
              <ellipse
                cx={fx} cy={fy}
                rx={radiusPx * 2.2} ry={radiusPx}
                fill="rgba(16,185,129,0.04)"
                stroke="rgba(16,185,129,0.22)"
                strokeWidth="0.9"
              />
            );
          })()}

          {/* Orbit trail */}
          {trail.length > 1 && (() => {
            // Detect antimeridian jumps in the trail too
            const segments: [number, number][][] = [];
            let cur: [number, number][] = [];
            for (let i = 0; i < trail.length; i++) {
              if (i > 0 && Math.abs(trail[i][0] - trail[i - 1][0]) > MAP_W / 2) {
                if (cur.length > 1) segments.push(cur);
                cur = [];
              }
              cur.push(trail[i]);
            }
            if (cur.length > 1) segments.push(cur);

            return segments.map((seg, si) => (
              <polyline
                key={si}
                points={seg.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
                fill="none"
                stroke={inSunlight ? 'rgba(251,191,36,0.35)' : 'rgba(96,165,250,0.35)'}
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ));
          })()}

          {/* ── Satellite icon ── */}
          {pos ? (
            <g transform={`translate(${satX}, ${satY})`} filter="url(#sat-glow)">
              {/* Animated outer ring */}
              <circle r={14} fill="none"
                stroke={inSunlight ? 'rgba(251,191,36,0.20)' : 'rgba(96,165,250,0.20)'}
                strokeWidth="0.8"
              >
                <animate attributeName="r" values="10;16;10" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0.1;0.4" dur="3s" repeatCount="indefinite" />
              </circle>
              {/* Mid ring */}
              <circle r={8} fill="none"
                stroke={inSunlight ? 'rgba(251,191,36,0.40)' : 'rgba(96,165,250,0.40)'}
                strokeWidth="0.9"
              />
              {/* Core */}
              <circle r={4}
                fill={inSunlight ? '#fbbf24' : '#60a5fa'}
                stroke={inSunlight ? '#fef3c7' : '#dbeafe'}
                strokeWidth="1"
              />
              {/* Solar panel arms */}
              <line x1={-8} y1={0} x2={-5} y2={0} stroke={inSunlight ? '#fbbf24' : '#60a5fa'} strokeWidth="1.2" opacity="0.85" />
              <line x1={5}  y1={0} x2={8}  y2={0} stroke={inSunlight ? '#fbbf24' : '#60a5fa'} strokeWidth="1.2" opacity="0.85" />
              <line x1={0}  y1={-8} x2={0}  y2={-5} stroke={inSunlight ? '#fbbf24' : '#60a5fa'} strokeWidth="1.2" opacity="0.85" />
              <line x1={0}  y1={5}  x2={0}  y2={8}  stroke={inSunlight ? '#fbbf24' : '#60a5fa'} strokeWidth="1.2" opacity="0.85" />
              {/* Panel end dots */}
              <circle cx={-7} cy={0} r={1.2} fill={inSunlight ? '#fbbf24' : '#60a5fa'} opacity="0.7" />
              <circle cx={7}  cy={0} r={1.2} fill={inSunlight ? '#fbbf24' : '#60a5fa'} opacity="0.7" />
            </g>
          ) : (
            /* Connecting placeholder */
            <g transform={`translate(${MAP_W / 2}, ${MAP_H / 2})`}>
              <circle r={5} fill="#1e2d4a" stroke="#2a3d5e" strokeWidth="1">
                <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite" />
              </circle>
            </g>
          )}

          {/* Grid labels */}
          <text x={6} y={MAP_H / 2 - 3}          fontSize="7" fill="#2a3d5e" fontFamily="monospace">EQ</text>
          <text x={MAP_W / 2 + 2} y={10}          fontSize="7" fill="#2a3d5e" fontFamily="monospace">0°</text>
          <text x={4}             y={10}           fontSize="7" fill="#2a3d5e" fontFamily="monospace">180°W</text>
          <text x={MAP_W - 30}    y={10}           fontSize="7" fill="#2a3d5e" fontFamily="monospace">180°E</text>
        </svg>

        {/* Connecting overlay */}
        {!pos && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#06101e]/70">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-3 h-3 border border-blue-500/40 border-t-blue-400 rounded-full animate-spin" />
              Waiting for ground-station data…
            </div>
          </div>
        )}

        {/* Coordinate overlay (bottom-left gradient bar) */}
        {pos && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#050c18]/95 via-[#050c18]/55 to-transparent px-3 py-2.5">
            <div className="flex flex-wrap gap-x-5 gap-y-0.5">
              <span className="text-[10px] font-mono">
                <span className="text-slate-600 mr-1">LAT</span>
                <span className="text-slate-200 font-semibold">
                  {pos.latitude >= 0 ? '+' : ''}{pos.latitude.toFixed(4)}°
                </span>
              </span>
              <span className="text-[10px] font-mono">
                <span className="text-slate-600 mr-1">LNG</span>
                <span className="text-slate-200 font-semibold">
                  {pos.longitude >= 0 ? '+' : ''}{pos.longitude.toFixed(4)}°
                </span>
              </span>
              <span className="text-[10px] font-mono">
                <span className="text-slate-600 mr-1">ALT</span>
                <span className="text-blue-300 font-semibold">{pos.altitude_km.toFixed(1)} km</span>
              </span>
              <span className="text-[10px] font-mono">
                <span className="text-slate-600 mr-1">VEL</span>
                <span className="text-amber-300 font-semibold">{velKmh} km/h</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Four coordinate cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-t border-[#1e2d4a]">

        {/* Latitude */}
        <div className="bg-[#080d1a] border border-[#1e2d4a] rounded-lg p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <MapPin className="w-3 h-3 text-slate-500" />
            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Latitude</span>
          </div>
          <div className="text-sm font-mono font-bold text-slate-200">
            {pos ? `${pos.latitude >= 0 ? '+' : ''}${pos.latitude.toFixed(4)}°` : '—'}
          </div>
          <div className="text-[9px] text-slate-600 mt-0.5">
            {pos ? (pos.latitude >= 0 ? 'North' : 'South') : ''}
          </div>
        </div>

        {/* Longitude */}
        <div className="bg-[#080d1a] border border-[#1e2d4a] rounded-lg p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <Navigation className="w-3 h-3 text-slate-500" />
            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Longitude</span>
          </div>
          <div className="text-sm font-mono font-bold text-slate-200">
            {pos ? `${pos.longitude >= 0 ? '+' : ''}${pos.longitude.toFixed(4)}°` : '—'}
          </div>
          <div className="text-[9px] text-slate-600 mt-0.5">
            {pos ? (pos.longitude >= 0 ? 'East' : 'West') : ''}
          </div>
        </div>

        {/* Altitude */}
        <div className="bg-[#080d1a] border border-[#1e2d4a] rounded-lg p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <ArrowUpDown className="w-3 h-3 text-blue-400" />
            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Altitude</span>
          </div>
          <div className="text-sm font-mono font-bold text-blue-400">
            {pos ? `${pos.altitude_km.toFixed(1)} km` : '—'}
          </div>
          <div className="text-[9px] text-slate-600 mt-0.5">
            {pos ? `~${(pos.altitude_km * 0.6214).toFixed(0)} mi` : ''}
          </div>
        </div>

        {/* Velocity */}
        <div className="bg-[#080d1a] border border-[#1e2d4a] rounded-lg p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <Gauge className="w-3 h-3 text-amber-400" />
            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Velocity</span>
          </div>
          <div className="text-sm font-mono font-bold text-amber-400">
            {pos ? `${velKmh} km/h` : '—'}
          </div>
          <div className="text-[9px] text-slate-600 mt-0.5">
            {pos ? `${velKms} km/s` : ''}
          </div>
        </div>
      </div>

      {/* ── Phase countdown + footprint row ── */}
      <div className="px-4 pb-3 flex items-stretch gap-3">

        {/* Countdown card with arc progress indicator */}
        <div className={cn(
          'flex-1 flex items-center gap-3 bg-[#080d1a] border rounded-xl px-3 py-2.5',
          inSunlight ? 'border-amber-500/20' : 'border-blue-500/20'
        )}>
          {/* SVG arc ring */}
          <div className="flex-shrink-0 relative" style={{ width: 44, height: 44 }}>
            <svg viewBox="0 0 44 44" width={44} height={44}>
              {/* Track */}
              <circle cx={ARC_CX} cy={ARC_CY} r={ARC_R}
                fill="none"
                stroke={inSunlight ? 'rgba(251,191,36,0.12)' : 'rgba(96,165,250,0.12)'}
                strokeWidth="3"
              />
              {/* Progress arc */}
              {pos && progressPct > 0 && (
                <path
                  d={arcPath}
                  fill="none"
                  stroke={inSunlight ? '#fbbf24' : '#60a5fa'}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              )}
              {/* Centre icon */}
              <g transform={`translate(${ARC_CX}, ${ARC_CY})`}>
                {inSunlight
                  ? <path d="M0,-5 L1.5,-1.5 L5,0 L1.5,1.5 L0,5 L-1.5,1.5 L-5,0 L-1.5,-1.5 Z"
                      fill="#fbbf24" opacity="0.9" />
                  : <circle r={3.5} fill="#60a5fa" opacity="0.9" />
                }
              </g>
            </svg>
          </div>

          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">
              <Clock className="w-2.5 h-2.5 inline mr-1 opacity-60" />
              Time to {inSunlight ? 'Eclipse' : 'Sunrise'}
            </div>
            <div className={cn(
              'text-2xl font-mono font-bold tabular-nums leading-none mt-1',
              inSunlight ? 'text-amber-400' : 'text-blue-400'
            )}>
              {pos ? formatCountdown(remainingS) : '—:——'}
            </div>
            <div className="text-[9px] text-slate-600 mt-0.5">
              {pos ? `${Math.round(progressPct)}% through ${inSunlight ? 'sunlight' : 'eclipse'} pass` : ''}
            </div>
          </div>

          {/* Current phase label */}
          {pos && (
            <div className="ml-auto text-right flex-shrink-0">
              <div className="text-[10px] text-slate-500">Current phase</div>
              <div className={cn('text-xs font-semibold mt-0.5', inSunlight ? 'text-amber-400' : 'text-blue-400')}>
                {inSunlight ? '☀ Sunlight' : '🌑 Eclipse'}
              </div>
              <div className="text-[10px] text-slate-600 mt-0.5">
                {inSunlight ? '~61 min' : '~31 min'} pass
              </div>
            </div>
          )}
        </div>

        {/* Footprint card */}
        {pos && (
          <div className="bg-[#080d1a] border border-[#1e2d4a] rounded-xl px-3 py-2.5 flex-shrink-0 flex flex-col justify-center">
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Footprint</div>
            <div className="text-sm font-mono font-bold text-emerald-400">
              {pos.footprint_km.toLocaleString(undefined, { maximumFractionDigits: 0 })} km
            </div>
            <div className="text-[9px] text-slate-600 mt-0.5">visibility ⌀</div>
          </div>
        )}
      </div>

    </div>
  );
}
