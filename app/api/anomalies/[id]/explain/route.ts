// ============================================================
// GET /api/anomalies/[id]/explain
//
// Generates an AI explanation for a single anomaly using the
// existing explainAnomaly() function from lib/ai-provider.ts.
//
// Uses IBM Granite via watsonx.ai when credentials are configured,
// falls back to the deterministic demo explanation automatically.
//
// Response:
//   { explanation, provider, confidence, ai_provider, cached }
//
// Credentials are server-side only — never included in the response.
// ============================================================

import { NextResponse } from 'next/server';
import { getDataProvider } from '@/lib/space-data-provider';
import { explainAnomaly, getActiveProvider } from '@/lib/ai-provider';

export const dynamic = 'force-dynamic';

// ── Simple in-process cache — one explanation per anomaly ID ──────────────────
// Explanations are deterministic for a given anomaly state, so we cache the
// first result for the server process lifetime. This avoids burning API quota
// on repeated clicks or hot-module reloads.

interface CachedExplanation {
  explanation: string;
  provider: string;
  confidence: number;
  ts: number;
}

const _cache = new Map<string, CachedExplanation>();
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const anomalyId = params.id;

  if (!anomalyId) {
    return NextResponse.json({ error: 'Anomaly ID is required' }, { status: 400 });
  }

  // ── Cache hit ────────────────────────────────────────────────────────────────
  const cached = _cache.get(anomalyId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json({
      explanation: cached.explanation,
      provider:    cached.provider,
      confidence:  cached.confidence,
      ai_provider: getActiveProvider(),
      cached:      true,
    });
  }

  // ── Load anomaly + telemetry ──────────────────────────────────────────────────
  const dataProvider = getDataProvider();

  let anomaly;
  try {
    const all = await dataProvider.getAnomalies();
    anomaly = all.find(a => a.id === anomalyId);
  } catch {
    return NextResponse.json({ error: 'Failed to load anomaly data' }, { status: 500 });
  }

  if (!anomaly) {
    return NextResponse.json({ error: 'Anomaly not found' }, { status: 404 });
  }

  // Fetch the most recent 12 telemetry readings for the affected spacecraft
  // to give Granite concrete numeric context.
  let telemetry: import('@/lib/types').TelemetryReading[] = [];
  try {
    const raw = await dataProvider.getTelemetry(anomaly.spacecraft_id, 1);
    // Keep only the 12 most recent readings to cap prompt size
    telemetry = raw.slice(-12);
  } catch {
    // Non-fatal — explainAnomaly handles empty telemetry gracefully
  }

  // ── Generate explanation ──────────────────────────────────────────────────────
  let result;
  try {
    result = await explainAnomaly(anomaly, telemetry);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to generate AI explanation', details: String(err) },
      { status: 500 },
    );
  }

  // ── Cache and return ──────────────────────────────────────────────────────────
  _cache.set(anomalyId, {
    explanation: result.content,
    provider:    result.provider,
    confidence:  result.confidence,
    ts:          Date.now(),
  });

  return NextResponse.json({
    explanation: result.content,
    provider:    result.provider,
    confidence:  result.confidence,
    ai_provider: getActiveProvider(),
    cached:      false,
  });
}
