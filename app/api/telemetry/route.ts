import { NextResponse } from 'next/server';
import { getDataProvider } from '@/lib/space-data-provider';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const spacecraftId = searchParams.get('spacecraft_id');
    const hoursBack = parseInt(searchParams.get('hours') || '24');

    if (!spacecraftId) {
      return NextResponse.json({ error: 'spacecraft_id is required' }, { status: 400 });
    }

    const provider = getDataProvider();
    const telemetry = await provider.getTelemetry(spacecraftId, hoursBack);

    return NextResponse.json({
      spacecraft_id: spacecraftId,
      hours_back: hoursBack,
      telemetry,
      count: telemetry.length,
      data_source: provider.getState().dataSource,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch telemetry', details: String(error) },
      { status: 500 }
    );
  }
}
