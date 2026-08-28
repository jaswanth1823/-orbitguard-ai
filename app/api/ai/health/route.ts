import { NextResponse } from 'next/server';
import { getConfigStatus, getActiveProvider } from '@/lib/ai-provider';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai/health
 *
 * Returns safe AI configuration status.
 * NEVER returns WATSONX_API_KEY or any credential value.
 */
export async function GET() {
  const status = getConfigStatus();

  return NextResponse.json(
    {
      provider: status.provider,
      configured: status.configured,
      // Show only whether each field is set, not the values
      fields: {
        api_key: status.apiKey,       // 'configured' | 'missing'
        project_id: status.projectId, // 'configured' | 'missing'
        url: status.url ?? 'missing',
        model_id: status.modelId ?? 'missing',
      },
      active_provider: getActiveProvider(),
      timestamp: new Date().toISOString(),
    },
    // AI config doesn't change at runtime — safe to cache for 30 s
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
  );
}
