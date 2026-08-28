// ============================================================
// Orbital Simulation Service
//
// Provides deterministic simulated orbital positions for the
// five representative tracked objects used in simulation mode.
//
// These positions are intentionally static reference values.
// They are clearly marked is_live: false so the UI can indicate
// that the data is NOT sourced from a real satellite tracking API.
//
// To connect a real data source later:
//   1. Create a new provider in lib/ (e.g. celestrak-provider.ts)
//   2. Call it from app/api/orbital/route.ts when the relevant
//      data mode is active
//   3. The Satellites page, OrbitalDataPanel, and OrbitalPosition
//      type require zero changes — the contract is already defined
//      in lib/types.ts (OrbitalDataResponse / OrbitalPosition)
// ============================================================

import type { OrbitalPosition, OrbitalDataResponse } from './types';

// --------------- Tracked object catalogue (simulation) ---------------
// Ordered by NORAD ID ascending.  These are real objects but the
// position values shown in simulation mode are static references,
// not current ground-track coordinates.

export interface SimulatedSatelliteEntry {
  norad_id: number;
  name: string;
  /** Reference latitude (degrees) — static, not real-time */
  ref_latitude: number;
  /** Reference longitude (degrees) — static, not real-time */
  ref_longitude: number;
  /** Nominal operational altitude (km) */
  altitude_km: number;
  /** Approximate circular-orbit velocity (km/s) */
  velocity_km_s: number;
  /** Description shown in the UI */
  description: string;
}

export const SIMULATED_SATELLITES: SimulatedSatelliteEntry[] = [
  {
    norad_id: 20580,
    name: 'HUBBLE',
    ref_latitude:   28.5,
    ref_longitude:  45.0,
    altitude_km:   547.0,
    velocity_km_s:  7.59,
    description: 'Hubble Space Telescope — NASA/ESA low-Earth orbit observatory',
  },
  {
    norad_id: 25544,
    name: 'ISS (ZARYA)',
    ref_latitude:   51.6,
    ref_longitude:   0.0,
    altitude_km:   418.0,
    velocity_km_s:  7.66,
    description: 'International Space Station — crewed orbital laboratory',
  },
  {
    norad_id: 25994,
    name: 'TERRA',
    ref_latitude:   -3.2,
    ref_longitude:  80.0,
    altitude_km:   705.0,
    velocity_km_s:  7.51,
    description: 'NASA Terra — Earth observation, sun-synchronous orbit',
  },
  {
    norad_id: 27424,
    name: 'AQUA',
    ref_latitude:  -65.0,
    ref_longitude: 120.0,
    altitude_km:   705.0,
    velocity_km_s:  7.51,
    description: 'NASA Aqua — climate monitoring, sun-synchronous orbit',
  },
  {
    norad_id: 40697,
    name: 'SENTINEL-2A',
    ref_latitude:   42.0,
    ref_longitude: -30.0,
    altitude_km:   786.0,
    velocity_km_s:  7.45,
    description: 'ESA Sentinel-2A — multispectral Earth observation',
  },
];

// --------------- Public helpers ---------------

/**
 * Build a snapshot of simulated orbital positions stamped at the
 * current server time.  The values are static reference coordinates —
 * they do NOT reflect the real-time position of these objects.
 */
export function buildSimulatedPositions(): OrbitalPosition[] {
  const now = new Date().toISOString();
  return SIMULATED_SATELLITES.map((sat): OrbitalPosition => ({
    norad_id:      sat.norad_id,
    name:          sat.name,
    latitude:      sat.ref_latitude,
    longitude:     sat.ref_longitude,
    altitude_km:   sat.altitude_km,
    velocity_km_s: sat.velocity_km_s,
    timestamp:     now,
    visibility:    'unknown',   // visibility is not calculable without real TLE data
    is_live:       false,       // explicit: these are NOT real-time positions
  }));
}

/** Simulation-mode note shown in the Orbital Tracking panel. */
export const SIMULATION_NOTE =
  'Running in simulation mode — positions shown are static reference values, not real-time coordinates. ' +
  'Set NEXT_PUBLIC_DATA_MODE=live and configure N2YO_API_KEY to enable real-time tracking.';

/**
 * Full OrbitalDataResponse for simulation mode.
 * This is the only function the API route needs to call in simulation mode.
 */
export function buildSimulatedOrbitalResponse(): OrbitalDataResponse {
  return {
    positions:   buildSimulatedPositions(),
    data_source: 'simulated',
    fetched_at:  new Date().toISOString(),
    note:        SIMULATION_NOTE,
  };
}
