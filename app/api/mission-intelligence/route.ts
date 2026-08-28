import { NextResponse } from 'next/server';
import { getDataProvider } from '@/lib/space-data-provider';
import { generateMissionBrief, generateGraniteAssessment, getActiveProvider } from '@/lib/ai-provider';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const provider = getDataProvider();

    // Fetch spacecraft, anomalies, and latest telemetry for all spacecraft in parallel.
    // Telemetry is fetched here (server-side only) and never returned raw to the browser,
    // so no credentials or sensitive data are exposed.
    const [spacecraft, anomalies] = await Promise.all([
      provider.getSpacecraft(),
      provider.getAnomalies(),
    ]);

    // Collect one latest telemetry reading per spacecraft for AI context.
    const latestTelemetryList = (
      await Promise.all(spacecraft.map(sc => provider.getLatestTelemetry(sc.id)))
    ).filter((t): t is NonNullable<typeof t> => t !== null);

    // Run brief and assessment generation in parallel to avoid serialising two
    // Granite calls. If either fails, its own error handler falls back to demo.
    const [brief, granite_assessment] = await Promise.all([
      generateMissionBrief(spacecraft, anomalies, latestTelemetryList),
      generateGraniteAssessment(spacecraft, anomalies, latestTelemetryList),
    ]);

    return NextResponse.json({
      brief,
      granite_assessment,
      spacecraft,
      anomalies,
      ai_provider: getActiveProvider(),
      data_source: provider.getState().dataSource,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate mission intelligence', details: String(error) },
      { status: 500 }
    );
  }
}
