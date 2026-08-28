import { NextResponse } from 'next/server';
import { getDataProvider } from '@/lib/space-data-provider';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const provider = getDataProvider();
    const spacecraft = await provider.getSpacecraft();
    return NextResponse.json(
      { spacecraft, data_source: provider.getState().dataSource },
      { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch spacecraft', details: String(error) },
      { status: 500 }
    );
  }
}
