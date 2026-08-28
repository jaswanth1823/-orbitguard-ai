// ============================================================
// N2YO Orbital Data Provider — server-side only
//
// SECURITY: N2YO_API_KEY is read from process.env server-side.
//           It is NEVER included in any response or passed to the browser.
//
// Caching: positions are cached for 60 s to avoid burning API quota.
//          The cache lives in module scope (server process memory).
//
// Graceful degradation:
//   missing key  → returns { error: 'no_key' }
//   bad key/403  → returns { error: 'auth_failed' }
//   rate limit   → returns { error: 'rate_limit' }
//   network      → returns { error: 'network_error' }
//   bad response → returns { error: 'parse_error' }
// ============================================================

import type { OrbitalPosition } from './types';

// --------------- N2YO response shapes ---------------

interface N2YOPositionEntry {
  satlatitude: number;
  satlongitude: number;
  sataltitude: number;
  azimuth: number;
  elevation: number;
  ra: number;
  dec: number;
  timestamp: number;
  eclipsed: boolean;
}

interface N2YOPositionsResponse {
  info: {
    satname: string;
    satid: number;
    transactionscount: number;
  };
  positions: N2YOPositionEntry[];
}

interface N2YOSatelliteInfo {
  satname: string;
  satid: number;
  intDesignator: string;
  launchDate: string;
  satlat: number;
  satlng: number;
  satalt: number;
}

interface N2YOAboveResponse {
  info: {
    category: string;
    transactionscount: number;
    satcount: number;
  };
  above: N2YOSatelliteInfo[];
}

// --------------- Well-known NORAD IDs to track ---------------
// These are real, publicly tracked objects.  In demo/fallback mode
// they will never be fetched; they are only used in live mode.

export const TRACKED_NORAD_IDS: Record<string, number> = {
  'ISS (ZARYA)': 25544,        // International Space Station
  'HUBBLE': 20580,             // Hubble Space Telescope
  'TERRA': 25994,              // NASA Terra (Earth observation)
  'AQUA': 27424,               // NASA Aqua (climate)
  'SENTINEL-2A': 40697,        // ESA Sentinel-2A (Earth observation)
  'SENTINEL-2B': 42063,        // ESA Sentinel-2B
  'SUOMI NPP': 37849,          // Suomi NPP (weather/climate)
  'NOAA 20': 43013,            // NOAA-20 (weather)
  'LANDSAT 9': 49260,          // Landsat 9 (Earth observation)
  'GOES 18': 51850,            // GOES-18 (GEO weather)
};

export const DEFAULT_NORAD_IDS = [25544, 20580, 25994, 27424, 40697];

// --------------- In-process cache ---------------

interface CacheEntry {
  positions: OrbitalPosition[];
  fetchedAt: number; // Date.now()
}

const CACHE_TTL_MS = 60_000; // 60 seconds
const cache = new Map<number, CacheEntry>();

function getCached(noradId: number): OrbitalPosition | null {
  const entry = cache.get(noradId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(noradId);
    return null;
  }
  return entry.positions[0] ?? null;
}

function setCached(noradId: number, positions: OrbitalPosition[]) {
  cache.set(noradId, { positions, fetchedAt: Date.now() });
}

/** Invalidate the entire position cache (useful for tests / forced refresh). */
export function clearOrbitalCache() {
  cache.clear();
}

// --------------- Error types ---------------

export type N2YOErrorCode =
  | 'no_key'
  | 'auth_failed'
  | 'rate_limit'
  | 'network_error'
  | 'parse_error'
  | 'satellite_not_found'
  | 'timeout';

export class N2YOError extends Error {
  constructor(public readonly code: N2YOErrorCode, message: string) {
    super(message);
    this.name = 'N2YOError';
  }
}

// --------------- Core fetch helper ---------------

const N2YO_BASE = 'https://api.n2yo.com/rest/v1/satellite';
const REQUEST_TIMEOUT_MS = 8_000;

async function n2yoFetch<T>(path: string, apiKey: string): Promise<T> {
  const url = `${N2YO_BASE}${path}&apiKey=${apiKey}`;
  let res: Response;

  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'User-Agent': 'OrbitGuard-AI/1.0' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new N2YOError('timeout', 'N2YO API request timed out');
    }
    throw new N2YOError('network_error', `Network error: ${String(err)}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new N2YOError('auth_failed', 'Invalid or unauthorised N2YO API key');
  }
  if (res.status === 429) {
    throw new N2YOError('rate_limit', 'N2YO API rate limit exceeded');
  }
  if (!res.ok) {
    throw new N2YOError('network_error', `N2YO HTTP ${res.status}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new N2YOError('parse_error', 'N2YO returned malformed JSON');
  }

  // N2YO returns 200 with an error body on bad satellite IDs
  if (
    typeof json === 'object' && json !== null &&
    'error' in json && typeof (json as Record<string, unknown>).error === 'string'
  ) {
    const errMsg = (json as Record<string, string>).error;
    if (errMsg.toLowerCase().includes('not found')) {
      throw new N2YOError('satellite_not_found', errMsg);
    }
    throw new N2YOError('parse_error', `N2YO error: ${errMsg}`);
  }

  return json as T;
}

// --------------- Validate API key ---------------

/**
 * Returns true if the key can reach N2YO successfully.
 * Uses the ISS as a low-cost probe (1 API transaction).
 */
export async function validateN2YOKey(apiKey: string): Promise<boolean> {
  try {
    await n2yoFetch<N2YOPositionsResponse>(
      `/positions/25544/0/0/0/1`,
      apiKey
    );
    return true;
  } catch {
    return false;
  }
}

// --------------- Map N2YO response → OrbitalPosition ---------------

function mapPosition(
  info: N2YOPositionsResponse['info'],
  entry: N2YOPositionEntry
): OrbitalPosition {
  // Compute approximate orbital velocity from altitude (vis-viva approximation)
  // v = sqrt(μ / r)  where μ = 398600.4418 km³/s², r = 6371 + alt km
  const mu = 398600.4418;
  const r = 6371 + entry.sataltitude;
  const velocity = Math.sqrt(mu / r);

  let visibility: OrbitalPosition['visibility'] = 'unknown';
  if (entry.eclipsed === true) visibility = 'eclipsed';
  else if (entry.elevation !== undefined) {
    visibility = entry.elevation > 0 ? 'visible' : 'daylight';
  }

  return {
    norad_id: info.satid,
    name: info.satname,
    latitude: Math.round(entry.satlatitude * 10000) / 10000,
    longitude: Math.round(entry.satlongitude * 10000) / 10000,
    altitude_km: Math.round(entry.sataltitude * 10) / 10,
    velocity_km_s: Math.round(velocity * 1000) / 1000,
    timestamp: new Date(entry.timestamp * 1000).toISOString(),
    visibility,
    is_live: true,
  };
}

// --------------- Public API ---------------

/**
 * Fetch the current position for a single NORAD ID.
 * Returns from cache if fresh.  Throws N2YOError on all failure paths.
 */
export async function fetchOrbitalPosition(noradId: number): Promise<OrbitalPosition> {
  const apiKey = process.env.N2YO_API_KEY;
  if (!apiKey || apiKey.trim().length < 5) {
    throw new N2YOError('no_key', 'N2YO_API_KEY is not configured');
  }

  const cached = getCached(noradId);
  if (cached) return cached;

  const data = await n2yoFetch<N2YOPositionsResponse>(
    `/positions/${noradId}/0/0/0/1`,
    apiKey.trim()
  );

  if (!data.positions?.length) {
    throw new N2YOError('parse_error', `No position data returned for NORAD ${noradId}`);
  }

  const position = mapPosition(data.info, data.positions[0]);
  setCached(noradId, [position]);
  return position;
}

/**
 * Fetch current positions for multiple NORAD IDs.
 * Failures for individual satellites are silently skipped so that one bad ID
 * does not break the entire response.
 */
export async function fetchOrbitalPositions(
  noradIds: number[] = DEFAULT_NORAD_IDS
): Promise<{ positions: OrbitalPosition[]; errors: Record<number, string> }> {
  const positions: OrbitalPosition[] = [];
  const errors: Record<number, string> = {};

  await Promise.allSettled(
    noradIds.map(async (id) => {
      try {
        const pos = await fetchOrbitalPosition(id);
        positions.push(pos);
      } catch (err) {
        errors[id] = err instanceof N2YOError ? err.message : String(err);
      }
    })
  );

  // Sort by NORAD ID for deterministic ordering
  positions.sort((a, b) => a.norad_id - b.norad_id);
  return { positions, errors };
}

/**
 * Get satellites above a geographic point (lat/lng, radius in km, category 0 = all).
 * Observer altitude defaults to 0 m (sea level).
 */
export async function fetchSatellitesAbove(
  lat: number,
  lng: number,
  altKm = 0,
  searchRadius = 70,
  categoryId = 0
): Promise<OrbitalPosition[]> {
  const apiKey = process.env.N2YO_API_KEY;
  if (!apiKey || apiKey.trim().length < 5) {
    throw new N2YOError('no_key', 'N2YO_API_KEY is not configured');
  }

  const data = await n2yoFetch<N2YOAboveResponse>(
    `/above/${lat}/${lng}/${altKm}/${searchRadius}/${categoryId}`,
    apiKey.trim()
  );

  return (data.above ?? []).map((sat): OrbitalPosition => ({
    norad_id: sat.satid,
    name: sat.satname,
    latitude: Math.round(sat.satlat * 10000) / 10000,
    longitude: Math.round(sat.satlng * 10000) / 10000,
    altitude_km: Math.round(sat.satalt * 10) / 10,
    velocity_km_s: 0, // not provided by /above endpoint
    timestamp: new Date().toISOString(),
    visibility: 'unknown',
    is_live: true,
  }));
}
