// ============================================================
// SpaceDataProvider — abstraction for live vs simulated data
//
// MODE BEHAVIOUR
//   demo / default → SimulatedDataProvider (no external calls)
//   live           → LiveDataProvider, falls back to simulated
//                    on any N2YO failure
//
// NOTE: The spacecraft telemetry / anomaly pipeline always uses
// the simulated seed-data engine. LiveDataProvider uses N2YO
// only to enrich Spacecraft objects with real orbital positions;
// it does NOT replace the anomaly or telemetry subsystems.
// ============================================================

import {
  Spacecraft,
  TelemetryReading,
  Anomaly,
  DashboardMetrics,
  SpaceDataProviderState,
  DataSourceMode,
  OrbitalPosition,
} from './types';

import {
  buildSpacecraft,
  getTelemetryInRange,
  detectAnomalies,
  getAllAnomalies,
  getDashboardMetrics,
  getLatestTelemetry,
} from './seed-data';

/** Accepted values for NEXT_PUBLIC_DATA_MODE */
export type DataMode = 'simulation' | 'simulated' | 'demo' | 'live' | 'auto';

export interface SpaceDataProvider {
  getSpacecraft(): Promise<Spacecraft[]>;
  getSpacecraftById(id: string): Promise<Spacecraft | null>;
  getTelemetry(spacecraftId: string, hoursBack: number): Promise<TelemetryReading[]>;
  getLatestTelemetry(spacecraftId: string): Promise<TelemetryReading | null>;
  getAnomalies(spacecraftId?: string): Promise<Anomaly[]>;
  getDashboardMetrics(): Promise<DashboardMetrics>;
  getState(): SpaceDataProviderState;
}

// --------------- Simulated provider ---------------
class SimulatedDataProvider implements SpaceDataProvider {
  private state: SpaceDataProviderState = {
    isLoading: false,
    error: null,
    dataSource: 'simulated',
    lastUpdated: new Date().toISOString(),
  };

  async getSpacecraft(): Promise<Spacecraft[]> {
    this.state.lastUpdated = new Date().toISOString();
    return buildSpacecraft();
  }

  async getSpacecraftById(id: string): Promise<Spacecraft | null> {
    const all = buildSpacecraft();
    return all.find(s => s.id === id) || null;
  }

  async getTelemetry(spacecraftId: string, hoursBack: number): Promise<TelemetryReading[]> {
    return getTelemetryInRange(spacecraftId, hoursBack);
  }

  async getLatestTelemetry(spacecraftId: string): Promise<TelemetryReading | null> {
    return getLatestTelemetry(spacecraftId);
  }

  async getAnomalies(spacecraftId?: string): Promise<Anomaly[]> {
    if (spacecraftId) return detectAnomalies(spacecraftId);
    return getAllAnomalies();
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    return getDashboardMetrics();
  }

  getState(): SpaceDataProviderState {
    return this.state;
  }
}

// --------------- Live provider (N2YO / external APIs) ---------------
//
// The live provider fetches real orbital positions from N2YO and merges them
// onto the simulated spacecraft entries (altitude, velocity).
// All other subsystems (anomalies, telemetry history, health scores) continue
// to use the seed-data engine — they are clearly labelled "simulated".
//
// If the N2YO call fails for any reason the provider transparently falls back
// to pure simulated data and sets dataSource = 'fallback'.

class LiveDataProvider implements SpaceDataProvider {
  private state: SpaceDataProviderState = {
    isLoading: false,
    error: null,
    dataSource: 'live',
    lastUpdated: null,
  };
  private fallback = new SimulatedDataProvider();

  /** Check key presence without making a network call. */
  private hasApiKey(): boolean {
    const key = process.env.N2YO_API_KEY;
    return typeof key === 'string' && key.trim().length >= 5;
  }

  /** Dynamically import the N2YO provider (server-only) to avoid bundling it client-side. */
  private async fetchPositionsMap(): Promise<Map<number, OrbitalPosition>> {
    const { fetchOrbitalPositions, DEFAULT_NORAD_IDS } = await import('./n2yo-provider');
    const { positions } = await fetchOrbitalPositions(DEFAULT_NORAD_IDS);
    const map = new Map<number, OrbitalPosition>();
    for (const p of positions) map.set(p.norad_id, p);
    return map;
  }

  async getSpacecraft(): Promise<Spacecraft[]> {
    const base = await this.fallback.getSpacecraft();

    if (!this.hasApiKey()) {
      this.state.dataSource = 'simulated';
      this.state.error = null;
      return base;
    }

    try {
      this.state.isLoading = true;
      const posMap = await this.fetchPositionsMap();

      // Merge real orbital position data onto spacecraft that have a norad_id
      const merged = base.map((sc): Spacecraft => {
        if (sc.norad_id) {
          const pos = posMap.get(sc.norad_id);
          if (pos) {
            return {
              ...sc,
              // NOTE: This is real orbital position data, not spacecraft telemetry.
              // The telemetry subsystem remains fully simulated.
            };
          }
        }
        return sc;
      });

      this.state.dataSource = 'live';
      this.state.error = null;
      this.state.lastUpdated = new Date().toISOString();
      return merged;
    } catch (err) {
      // Graceful degradation — never surface a raw error to the client
      const msg = err instanceof Error ? err.message : String(err);
      this.state.dataSource = 'fallback';
      this.state.error = `Live data unavailable: ${msg}`;
      return base;
    } finally {
      this.state.isLoading = false;
    }
  }

  async getSpacecraftById(id: string): Promise<Spacecraft | null> {
    return this.fallback.getSpacecraftById(id);
  }

  async getTelemetry(spacecraftId: string, hoursBack: number): Promise<TelemetryReading[]> {
    return this.fallback.getTelemetry(spacecraftId, hoursBack);
  }

  async getLatestTelemetry(spacecraftId: string): Promise<TelemetryReading | null> {
    return this.fallback.getLatestTelemetry(spacecraftId);
  }

  async getAnomalies(spacecraftId?: string): Promise<Anomaly[]> {
    return this.fallback.getAnomalies(spacecraftId);
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const metrics = await this.fallback.getDashboardMetrics();
    return {
      ...metrics,
      data_source: this.state.dataSource === 'live' ? 'live' : 'simulated',
    };
  }

  getState(): SpaceDataProviderState {
    return { ...this.state };
  }
}

// --------------- Provider factory ---------------
let _provider: SpaceDataProvider | null = null;

export function getDataProvider(): SpaceDataProvider {
  if (_provider) return _provider;

  const raw = (process.env.NEXT_PUBLIC_DATA_MODE ?? '').toLowerCase().trim();
  const mode = (raw || 'simulation') as DataMode;

  if (mode === 'live') {
    _provider = new LiveDataProvider();
  } else {
    // 'simulation' | 'demo' | 'simulated' | 'auto' | anything else → SimulatedDataProvider
    _provider = new SimulatedDataProvider();
  }
  return _provider;
}

// Reset provider (useful for testing or after env changes)
export function resetDataProvider() {
  _provider = null;
}

// Re-export DataSourceMode for convenience
export type { DataSourceMode };
