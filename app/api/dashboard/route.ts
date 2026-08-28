import { NextResponse } from 'next/server';
import { getDataProvider } from '@/lib/space-data-provider';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const provider = getDataProvider();
    const [spacecraft, metrics, anomalies] = await Promise.all([
      provider.getSpacecraft(),
      provider.getDashboardMetrics(),
      provider.getAnomalies(),
    ]);

    const state = provider.getState();

    return NextResponse.json({
      spacecraft,
      metrics,
      anomalies: anomalies.slice(0, 10), // Recent 10 for dashboard
      data_source: state.dataSource,
      last_updated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data', details: String(error) },
      { status: 500 }
    );
  }
}
