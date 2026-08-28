import { NextResponse } from 'next/server';
import { getDataProvider } from '@/lib/space-data-provider';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const spacecraftId = searchParams.get('spacecraft_id') || undefined;
    const severity = searchParams.get('severity') || undefined;
    const activeOnly = searchParams.get('active') !== 'false';

    const provider = getDataProvider();
    let anomalies = await provider.getAnomalies(spacecraftId);

    if (severity) {
      anomalies = anomalies.filter(a => a.severity === severity);
    }
    if (activeOnly) {
      anomalies = anomalies.filter(a => a.is_active);
    }

    return NextResponse.json({
      anomalies,
      total: anomalies.length,
      data_source: provider.getState().dataSource,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch anomalies', details: String(error) },
      { status: 500 }
    );
  }
}
