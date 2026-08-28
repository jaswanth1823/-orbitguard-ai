// ============================================================
// GET /api/orbital
//
// Returns orbital positions for the five tracked satellites.
//
// ORBITAL_DATA_MODE (server-only env var — never prefixed NEXT_PUBLIC_):
//   simulation | demo | <unset>  →  static simulated positions, no external calls
//   live                         →  real-time N2YO positions; falls back to
//                                   simulation if the key is missing or the
//                                   request fails for any reason
//
// SECURITY:
//   N2YO_API_KEY is read server-side only and is NEVER included in any
//   response body, header, or log output.
//   ORBITAL_DATA_MODE is also server-only — not prefixed NEXT_PUBLIC_.
//
// Response shape: OrbitalDataResponse (lib/types.ts)
//   data_source:
//     'simulated' — static reference positions from lib/orbital-simulation.ts
//     'n2yo'      — real-time positions from N2YO API
//     'fallback'  — live mode was requested but N2YO failed; simulation used
//
// Caching:
//   Successful N2YO responses are cached server-side for 60 s.
//   Simulation responses are generated fresh on each call (cheap, no I/O).
// ============================================================

import { NextResponse } from 'next/server';
import type { OrbitalDataResponse } from '@/lib/types';
import { buildSimulatedOrbitalResponse } from '@/lib/orbital-simulation';
import {
  fetchOrbitalPositions,
  DEFAULT_NORAD_IDS,
} from '@/lib/n2yo-provider';

export const dynamic = 'force-dynamic';

// ── Mode resolution ────────────────────────────────────────────────────────────
// ORBITAL_DATA_MODE is a server-only variable.  It is intentionally NOT
// prefixed with NEXT_PUBLIC_ so it is never bundled into client-side JS.

type OrbitalMode = 'simulation' | 'live';

function resolveMode(): OrbitalMode {
  const raw = (process.env.ORBITAL_DATA_MODE ?? '').toLowerCase().trim();
  if (raw === 'live') return 'live';
  // 'simulation', 'demo', '', or anything else → simulation
  return 'simulation';
}

// ── Server-side response cache (live mode only) ────────────────────────────────
const CACHE_TTL_MS = 60_000; // 60 seconds — matches n2yo-provider.ts per-satellite cache
let _liveCache: { body: OrbitalDataResponse; ts: number } | null = null;

function getLiveCache(): OrbitalDataResponse | null {
  if (!_liveCache) return null;
  if (Date.now() - _liveCache.ts > CACHE_TTL_MS) {
    _liveCache = null;
    return null;
  }
  return _liveCache.body;
}

function setLiveCache(body: OrbitalDataResponse) {
  _liveCache = { body, ts: Date.now() };
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const mode = resolveMode();

  // ── Simulation mode ──────────────────────────────────────────────────────────
  if (mode === 'simulation') {
    return NextResponse.json(
      buildSimulatedOrbitalResponse(),
      { status: 200, headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } }
    );
  }

  // ── Live mode ────────────────────────────────────────────────────────────────

  // Check key presence without exposing it
  const apiKey = process.env.N2YO_API_KEY?.trim();
  if (!apiKey) {
    const body: OrbitalDataResponse = {
      ...buildSimulatedOrbitalResponse(),
      data_source: 'fallback',
      note: 'N2YO_API_KEY is not configured — showing simulated positions. ' +
            'Add N2YO_API_KEY to .env.local and set ORBITAL_DATA_MODE=live to enable real-time tracking.',
    };
    return NextResponse.json(body, { status: 200 });
  }

  // Return cached live response if still fresh
  const cached = getLiveCache();
  if (cached) {
    return NextResponse.json(cached, { status: 200 });
  }

  // Parse optional NORAD ID override from query string
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids');
  const noradIds: number[] = idsParam
    ? idsParam.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0)
    : DEFAULT_NORAD_IDS;

  if (!noradIds.length) {
    return NextResponse.json(
      {
        ...buildSimulatedOrbitalResponse(),
        data_source: 'fallback',
        error: 'No valid NORAD IDs provided',
      } satisfies OrbitalDataResponse,
      { status: 400 }
    );
  }

  // Fetch from N2YO — all error handling is inside fetchOrbitalPositions;
  // individual satellite failures are isolated so one bad ID doesn't fail all.
  try {
    const { positions, errors } = await fetchOrbitalPositions(noradIds);
    const fetched_at = new Date().toISOString();
    const errorCount = Object.keys(errors).length;

    if (positions.length === 0) {
      // Every satellite fetch failed — fall back to simulation
      const body: OrbitalDataResponse = {
        ...buildSimulatedOrbitalResponse(),
        data_source: 'fallback',
        fetched_at,
        note: `N2YO returned no positions — showing simulated fallback. Errors: ${Object.values(errors).join('; ')}`,
      };
      // Cache the fallback briefly to avoid hammering a broken API
      setLiveCache(body);
      return NextResponse.json(body, { status: 200 });
    }

    // Partial or full success
    const body: OrbitalDataResponse = {
      positions,
      data_source: 'n2yo',
      fetched_at,
      note: errorCount > 0
        ? `${positions.length} of ${noradIds.length} satellites tracked via N2YO; ${errorCount} failed`
        : undefined,
    };

    setLiveCache(body);
    return NextResponse.json(body, { status: 200 });

  } catch (err) {
    // Top-level catch — never expose the raw error or key
    const code: string =
      err !== null && typeof err === 'object' && 'code' in err &&
      typeof (err as { code: unknown }).code === 'string'
        ? (err as { code: string }).code
        : 'unknown';

    const body: OrbitalDataResponse = {
      ...buildSimulatedOrbitalResponse(),
      data_source: 'fallback',
      note: getFallbackNote(code),
    };

    setLiveCache(body);
    return NextResponse.json(body, { status: 200 });
  }
}

// ── Safe user-facing error notes (no API key or raw errors leaked) ─────────────

function getFallbackNote(code: string): string {
  switch (code) {
    case 'no_key':        return 'N2YO API key is not configured — showing simulated positions';
    case 'auth_failed':   return 'N2YO API key is invalid — showing simulated positions';
    case 'rate_limit':    return 'N2YO API rate limit reached — showing simulated positions';
    case 'timeout':       return 'N2YO API request timed out — showing simulated positions';
    case 'network_error': return 'N2YO API is unreachable — showing simulated positions';
    case 'parse_error':   return 'Unexpected N2YO response format — showing simulated positions';
    default:              return 'N2YO data unavailable — showing simulated positions';
  }
}
