import { NextResponse } from 'next/server';
import { getDataProvider } from '@/lib/space-data-provider';
import { queryCopilot, getActiveProvider } from '@/lib/ai-provider';
import type { OrbitalDataResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { question, conversation_history } = body;

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const provider = getDataProvider();
    const [spacecraft, anomalies, latestTelemetry, orbitalRaw] = await Promise.all([
      provider.getSpacecraft(),
      provider.getAnomalies(),
      Promise.all(['ORBIT-01', 'ORBIT-02', 'ORBIT-03', 'ORBIT-04', 'ORBIT-05'].map(
        id => provider.getLatestTelemetry(id)
      )).then(results => results.filter(Boolean) as any[]),
      // Fetch orbital positions server-side (reuses existing route logic via internal fetch)
      fetch(new URL('/api/orbital', request.url).toString())
        .then(r => r.ok ? r.json() as Promise<OrbitalDataResponse> : null)
        .catch(() => null as OrbitalDataResponse | null),
    ]);

    const orbitalData = orbitalRaw
      ? { positions: orbitalRaw.positions, data_source: orbitalRaw.data_source as 'n2yo' | 'simulated' | 'fallback' }
      : undefined;

    const response = await queryCopilot({
      question,
      spacecraft,
      anomalies,
      latestTelemetry,
      conversationHistory: conversation_history,
      orbitalData,
    });

    return NextResponse.json({
      response: response.content,
      provider: response.provider,
      confidence: response.confidence,
      sources: response.sources,
      ai_status: getActiveProvider() === 'watsonx' ? 'watsonx' : 'demo',
    });
  } catch (error) {
    console.error('Copilot API error:', error);
    return NextResponse.json(
      { error: 'Failed to process question', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'online',
    ai_provider: getActiveProvider(),
    capabilities: [
      'spacecraft_status_analysis',
      'anomaly_explanation',
      'telemetry_interpretation',
      'investigation_prioritization',
    ],
  });
}
