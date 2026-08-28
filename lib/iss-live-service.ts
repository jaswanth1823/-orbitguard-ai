// ============================================================
// OrbitGuard AI — ISS Live Telemetry Service
//
// Fetches real-time ISS position from the public
// wheretheiss.at API (no key required, CORS-enabled).
//
// API endpoint: https://api.wheretheiss.at/v1/satellites/25544
//
// Response fields used:
//   latitude, longitude, altitude (km), velocity (km/h),
//   visibility ("daylight" | "eclipsed"),
//   solar_lat, solar_lon, footprint (km)
//
// Server-side only.  Never called from the browser.
//
// Battery, thermal, and EPS parameters are derived from the
// real orbital visibility state so the SimTelemetry shape
// stays compatible with the simulation panel.
// ============================================================

import type { SimTelemetry, OrbitalPhase } from './telemetry-simulation';

// ── wheretheiss.at response shape ─────────────────────────────────────────────

interface ISSApiResponse {
  name: string;
  id: number;
  latitude: number;
  longitude: number;
  altitude: number;       // km
  velocity: number;       // km/h
  visibility: string;     // "daylight" | "eclipsed"
  footprint: number;      // km diameter
  timestamp: number;      // Unix seconds
  daynum: number;
  solar_lat: number;
  solar_lon: number;
  units: string;          // "kilometers"
}

// ── Server-side 2-second cache ────────────────────────────────────────────────

interface CacheEntry {
  tel: SimTelemetry;
  fetchedAt: number; // ms epoch
}

let _cache: CacheEntry | null = null;
let _tick = 0;

const CACHE_TTL_MS = 2000; // refresh at most every 2 s
const FETCH_TIMEOUT_MS = 4000;
const ISS_URL = 'https://api.wheretheiss.at/v1/satellites/25544';

// ── Gaussian noise (tiny — just for gauge liveness) ──────────────────────────

function gauss(sigma: number): number {
  const u = Math.random();
  const v = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u + 1e-15)) * Math.cos(2 * Math.PI * v);
}

// ── Physics derivations from real visibility ──────────────────────────────────

/**
 * Given the real ISS visibility flag, derive subsystem parameters that
 * change with solar exposure, exactly matching the specified ranges.
 */
function deriveSubsystems(visibility: string, altitude: number): Omit<SimTelemetry,
  'tick' | 'timestamp' | 'data_source' | 'orbital_phase' | 'orbital_progress_pct' |
  'time_in_phase_s' | 'remaining_in_phase_s' | 'active_anomalies' | 'anomaly_descriptions' |
  'iss_latitude' | 'iss_longitude' | 'iss_altitude_km' | 'iss_velocity_kph' |
  'iss_solar_lat' | 'iss_solar_lng' | 'iss_footprint_km'
> {
  const inSun = visibility !== 'eclipsed';

  // Battery charging/discharging
  // Sunlight:  +3.8 A to +5.2 A  → midpoint 4.5 A, σ=0.25
  // Eclipse:   -4.5 A to -7.0 A  → midpoint -5.75 A, σ=0.35
  const battCurrentA = inSun
    ? 4.5  + gauss(0.25)
    : -5.75 + gauss(0.35);

  // Solar generation
  // Sunlight:  420–460 W  → midpoint 440 W, σ=7
  // Eclipse:   0 W
  const solarGenW = inSun ? 440 + gauss(7) : 0;

  // Solar panel temperature
  // Sunlight:  +75°C to +95°C  → midpoint 85°C, σ=3
  // Eclipse:   -40°C to -65°C  → midpoint -52.5°C, σ=4
  const solarArrayTempC = inSun
    ? 85   + gauss(3)
    : -52.5 + gauss(4);

  // Core avionics — rises with solar load on structure
  // Nominal 22–28°C, +4°C in sunlight, -4°C in eclipse
  const coreBase = inSun ? 26 : 20;
  const coreTempC = coreBase + gauss(0.4);

  // Bus voltage — stays close to 28V
  const epsBusV = 27.8 + gauss(0.04) + (inSun ? 0.15 : -0.15);

  // Power consumption — base load ± noise
  const consumptionW = 220 + gauss(5);

  // Battery SoC — ISS keeps batteries in the 50–90% healthy range
  // Trending up in sun, down in eclipse; we don't integrate over time here,
  // so we model a plausible instantaneous state.
  const socBase = inSun ? 72 : 65;
  const socPct = Math.max(20, Math.min(100, socBase + gauss(3)));

  // Battery voltage linear with SoC (24 V @ 20%, 32 V @ 100%)
  const voltageV = 24 + ((socPct - 20) / 80) * 8 + gauss(0.05);

  // Battery temperature — warmer in sun, cooler in eclipse
  const battTempC = (inSun ? 22 : 8) + gauss(0.5);

  // Payload temperature
  const payloadTempC = 30 + (inSun ? 4 : -4) + gauss(0.4);

  return {
    battery_soc_pct:      Math.round(socPct * 10) / 10,
    battery_voltage_v:    Math.round(voltageV * 100) / 100,
    battery_current_a:    Math.round(battCurrentA * 100) / 100,
    battery_temp_c:       Math.round(battTempC * 10) / 10,

    core_temp_c:          Math.round(coreTempC * 10) / 10,
    solar_array_temp_c:   Math.round(solarArrayTempC * 10) / 10,
    payload_temp_c:       Math.round(payloadTempC * 10) / 10,

    solar_generation_w:   Math.round(Math.max(0, solarGenW) * 10) / 10,
    power_consumption_w:  Math.round(Math.max(50, consumptionW) * 10) / 10,
    eps_bus_voltage_v:    Math.round(Math.max(27, Math.min(29.5, epsBusV)) * 1000) / 1000,
  };
}

// ── Orbital-phase derived fields ──────────────────────────────────────────────

// ISS orbital period ≈ 92 min. We compute approximate phase progress from the
// real Unix timestamp so the orbital ring stays meaningful.
const ISS_PERIOD_S = 92 * 60;

function orbitalProgress(unixSec: number, visibility: string): {
  phase: OrbitalPhase;
  orbital_progress_pct: number;
  time_in_phase_s: number;
  remaining_in_phase_s: number;
} {
  const posInPeriod = unixSec % ISS_PERIOD_S;
  // ISS sunlight fraction ≈ 60/92 of each orbit
  const sunlightS = Math.round((60 / 90) * ISS_PERIOD_S);
  const eclipseS  = ISS_PERIOD_S - sunlightS;

  // Use the real visibility flag as the ground truth for phase
  const phase: OrbitalPhase = visibility !== 'eclipsed' ? 'sunlight' : 'eclipse';

  const inSunPhase = posInPeriod < sunlightS;
  const timeInPhase = inSunPhase ? posInPeriod : posInPeriod - sunlightS;
  const phaseDuration = inSunPhase ? sunlightS : eclipseS;
  const remaining = phaseDuration - timeInPhase;

  return {
    phase,
    orbital_progress_pct: Math.round((posInPeriod / ISS_PERIOD_S) * 1000) / 10,
    time_in_phase_s: Math.round(timeInPhase),
    remaining_in_phase_s: Math.round(Math.max(0, remaining)),
  };
}

// ── Main fetch function ───────────────────────────────────────────────────────

/**
 * Fetches ISS position from wheretheiss.at and returns a SimTelemetry snapshot.
 * Results are cached for 2 seconds to avoid hammering the public API.
 */
export async function fetchISSLiveTelemetry(): Promise<SimTelemetry> {
  const now = Date.now();

  // Serve from cache if fresh
  if (_cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    // Return a copy with a fresh timestamp + incremented tick for liveness
    _tick += 1;
    return {
      ..._cache.tel,
      tick: _tick,
      timestamp: new Date().toISOString(),
      // Re-derive subsystems with fresh noise on every call so gauges animate
      ...deriveSubsystems(
        _cache.tel.orbital_phase === 'sunlight' ? 'daylight' : 'eclipsed',
        _cache.tel.iss_altitude_km ?? 420
      ),
    };
  }

  // Fetch from API with a hard timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let raw: ISSApiResponse;
  try {
    const res = await fetch(ISS_URL, {
      signal: controller.signal,
      // No cache headers — always want fresh
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) {
      throw new Error(`wheretheiss.at returned HTTP ${res.status}`);
    }
    raw = await res.json() as ISSApiResponse;
  } finally {
    clearTimeout(timer);
  }

  _tick += 1;

  const { phase, orbital_progress_pct, time_in_phase_s, remaining_in_phase_s } =
    orbitalProgress(raw.timestamp, raw.visibility);

  const sub = deriveSubsystems(raw.visibility, raw.altitude);

  const tel: SimTelemetry = {
    tick: _tick,
    timestamp: new Date().toISOString(),
    data_source: 'live',

    orbital_phase: phase,
    orbital_progress_pct,
    time_in_phase_s,
    remaining_in_phase_s,

    ...sub,

    active_anomalies: [],
    anomaly_descriptions: {} as Record<never, never>,

    // ISS-specific real fields
    iss_latitude:    Math.round(raw.latitude   * 1e4) / 1e4,
    iss_longitude:   Math.round(raw.longitude  * 1e4) / 1e4,
    iss_altitude_km: Math.round(raw.altitude   * 10)  / 10,
    iss_velocity_kph: Math.round(raw.velocity  * 10)  / 10,
    iss_solar_lat:   Math.round(raw.solar_lat  * 100) / 100,
    iss_solar_lng:   Math.round(raw.solar_lon  * 100) / 100,
    iss_footprint_km: Math.round(raw.footprint),
  };

  _cache = { tel, fetchedAt: now };
  return tel;
}
