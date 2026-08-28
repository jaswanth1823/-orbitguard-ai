import { NextResponse } from 'next/server';
import { testWatsonxConnection } from '@/lib/ai-provider';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/test
 *
 * Tests the watsonx.ai connection using server-side credentials.
 * Returns only safe status information — never exposes credentials.
 */
export async function POST() {
  const result = await testWatsonxConnection();

  if (result.ok) {
    return NextResponse.json({
      status: 'connected',
      provider: result.provider,
      model: result.model,
      message: 'Successfully connected to IBM watsonx.ai.',
      timestamp: new Date().toISOString(),
    });
  }

  // Map error kinds to user-friendly messages — no raw credential info
  return NextResponse.json(
    {
      status: 'failed',
      provider: result.provider,
      model: result.model,
      message: result.error ?? 'Connection test failed.',
      // Expose the error kind so the UI can give actionable guidance
      error_kind: result.errorKind ?? 'unknown',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }, // Always 200 — caller decides how to handle
  );
}
