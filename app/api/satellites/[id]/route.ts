import { NextResponse } from 'next/server';
import { getDataProvider } from '@/lib/space-data-provider';
import { calculateHealthScore } from '@/lib/seed-data';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const provider = getDataProvider();
    const { searchParams } = new URL(request.url);
    const hoursBack = parseInt(searchParams.get('hours') || '24');

    const [spacecraft, telemetry, anomalies] = await Promise.all([
      provider.getSpacecraftById(params.id),
      provider.getTelemetry(params.id, hoursBack),
      provider.getAnomalies(params.id),
    ]);

    if (!spacecraft) {
      return NextResponse.json({ error: 'Spacecraft not found' }, { status: 404 });
    }

    const healthBreakdown = calculateHealthScore(params.id);

    return NextResponse.json({
      spacecraft,
      telemetry,
      anomalies,
      health_breakdown: healthBreakdown,
      data_source: provider.getState().dataSource,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch spacecraft data', details: String(error) },
      { status: 500 }
    );
  }
}
