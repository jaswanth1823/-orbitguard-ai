// ============================================================
// GET /api/groundtrack
//
// Dedicated SSE endpoint for the GroundTrackWidget.
// Emits a lightweight ground-track snapshot every 2 seconds.
// Shares the same server-side ISS cache as /api/simulation/live
// so no extra external API calls are made.
//
// Event shape:
//   event: position
//   data: GroundTrackSnapshot (JSON)
//
//   event: error
//   data: { message: string }
// ============================================================

import { fetchISSLiveTelemetry } from '@/lib/iss-live-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      let active = true;

      function send(event: string, data: unknown) {
        try {
          controller.enqueue(
            new TextEncoder().encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
            )
          );
        } catch { /* controller closed */ }
      }

      // Announce connection
      send('status', { ok: true, source: 'groundtrack', norad_id: 25544 });

      async function tick() {
        if (!active) return;
        try {
          const tel = await fetchISSLiveTelemetry();

          // Extract only what the widget needs (thin payload)
          send('position', {
            latitude:          tel.iss_latitude   ?? 0,
            longitude:         tel.iss_longitude  ?? 0,
            altitude_km:       tel.iss_altitude_km ?? 420,
            velocity_kph:      tel.iss_velocity_kph ?? 27600,
            visibility:        tel.orbital_phase === 'sunlight' ? 'daylight' : 'eclipsed',
            solar_lat:         tel.iss_solar_lat  ?? 0,
            solar_lng:         tel.iss_solar_lng  ?? 0,
            footprint_km:      tel.iss_footprint_km ?? 4500,
            remaining_phase_s: tel.remaining_in_phase_s,
            orbital_phase:     tel.orbital_phase,
            timestamp:         tel.timestamp,
          });
        } catch (err) {
          send('error', {
            message: err instanceof Error ? err.message : 'Ground station unreachable',
          });
        }
        if (active) setTimeout(tick, 2000);
      }

      await tick();

      // Keep-alive comments every 15 s
      const ka = setInterval(() => {
        if (!active) { clearInterval(ka); return; }
        try { controller.enqueue(new TextEncoder().encode(': keep-alive\n\n')); }
        catch { clearInterval(ka); active = false; }
      }, 15_000);

      request.signal.addEventListener('abort', () => {
        active = false;
        clearInterval(ka);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':    'text/event-stream',
      'Cache-Control':   'no-cache, no-transform',
      'Connection':      'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
