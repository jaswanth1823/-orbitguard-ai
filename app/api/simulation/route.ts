// ============================================================
// POST /api/simulation          — control (start/stop/inject/resolve)
// GET  /api/simulation?id=...   — snapshot of current state
// ============================================================

import { NextResponse } from 'next/server';
import {
  getSimulationEngine,
  listActiveEngines,
  type AnomalyMode,
} from '@/lib/telemetry-simulation';

export const dynamic = 'force-dynamic';

const VALID_ANOMALY_MODES: AnomalyMode[] = [
  'thermal_runaway',
  'solar_occlusion',
  'battery_degradation',
  'payload_surge',
];

function isValidAnomalyMode(v: unknown): v is AnomalyMode {
  return typeof v === 'string' && VALID_ANOMALY_MODES.includes(v as AnomalyMode);
}

// ── GET — return current simulation state ─────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id') ?? 'ORBIT-01';

  const engine = getSimulationEngine(id);
  const state = engine.getState();

  return NextResponse.json({
    spacecraft_id: id,
    running: state.running,
    tick: state.tick,
    active_anomalies: Array.from(state.active_anomalies),
    latest: state.latest,
    all_active: listActiveEngines(),
  });
}

// ── POST — control actions ─────────────────────────────────────────────────────
//
// Body shapes:
//   { action: 'start',   spacecraft_id: string }
//   { action: 'stop',    spacecraft_id: string }
//   { action: 'inject',  spacecraft_id: string, anomaly: AnomalyMode }
//   { action: 'resolve', spacecraft_id: string, anomaly: AnomalyMode }
//   { action: 'resolve_all', spacecraft_id: string }

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, spacecraft_id, anomaly } = body as {
    action?: string;
    spacecraft_id?: string;
    anomaly?: string;
  };

  const id = typeof spacecraft_id === 'string' && spacecraft_id.trim()
    ? spacecraft_id.trim()
    : 'ORBIT-01';

  const engine = getSimulationEngine(id);

  switch (action) {
    case 'start': {
      engine.start();
      return NextResponse.json({
        ok: true,
        action: 'start',
        spacecraft_id: id,
        running: engine.running,
      });
    }

    case 'stop': {
      engine.stop();
      return NextResponse.json({
        ok: true,
        action: 'stop',
        spacecraft_id: id,
        running: engine.running,
      });
    }

    case 'inject': {
      if (!isValidAnomalyMode(anomaly)) {
        return NextResponse.json({
          error: `Unknown anomaly mode "${anomaly}". Valid: ${VALID_ANOMALY_MODES.join(', ')}`,
        }, { status: 400 });
      }
      engine.triggerAnomaly(anomaly);
      return NextResponse.json({
        ok: true,
        action: 'inject',
        spacecraft_id: id,
        anomaly,
        active_anomalies: Array.from(engine.getState().active_anomalies),
      });
    }

    case 'resolve': {
      if (!isValidAnomalyMode(anomaly)) {
        return NextResponse.json({
          error: `Unknown anomaly mode "${anomaly}". Valid: ${VALID_ANOMALY_MODES.join(', ')}`,
        }, { status: 400 });
      }
      engine.resolveAnomaly(anomaly);
      return NextResponse.json({
        ok: true,
        action: 'resolve',
        spacecraft_id: id,
        anomaly,
        active_anomalies: Array.from(engine.getState().active_anomalies),
      });
    }

    case 'resolve_all': {
      engine.resolveAllAnomalies();
      return NextResponse.json({
        ok: true,
        action: 'resolve_all',
        spacecraft_id: id,
        active_anomalies: [],
      });
    }

    default:
      return NextResponse.json({
        error: `Unknown action "${action}". Valid: start, stop, inject, resolve, resolve_all`,
      }, { status: 400 });
  }
}
