// ============================================================
// GET /api/simulation/live?id=<spacecraft_id>
//
// Server-Sent Events endpoint.
// Streams real ISS telemetry from wheretheiss.at every 2 seconds,
// mapped to the same SimTelemetry shape used by the simulation stream
// so the TelemetrySimPanel can switch modes seamlessly.
//
// The ISS (NORAD 25544) is used as the live source.
// Orbital phase (sunlight/eclipse) is the REAL value from the API.
// Battery, thermal and EPS parameters are physically derived from it.
//
// Client usage:
//   const es = new EventSource('/api/simulation/live');
//   es.addEventListener('telemetry', e => {
//     const t = JSON.parse(e.data); // SimTelemetry with data_source:'live'
//   });
// ============================================================

import { fetchISSLiveTelemetry } from '@/lib/iss-live-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          new TextEncoder().encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
          )
        );
      }

      let active = true;

      // Announce connection
      send('status', {
        ok: true,
        source: 'iss-live',
        norad_id: 25544,
        message: 'ISS live telemetry stream connected',
      });

      // Poll loop — fetch & broadcast every 2 seconds
      async function tick() {
        if (!active) return;

        try {
          const tel = await fetchISSLiveTelemetry();
          send('telemetry', tel);
        } catch (err) {
          send('error', {
            message: err instanceof Error ? err.message : 'Fetch failed',
          });
          // Don't stop — keep retrying on transient failures
        }

        if (active) {
          setTimeout(tick, 2000);
        }
      }

      // Send first reading immediately, then start interval
      await tick();

      // Keep-alive comments every 15 s to prevent proxy / edge timeouts
      const keepAlive = setInterval(() => {
        if (!active) {
          clearInterval(keepAlive);
          return;
        }
        try {
          controller.enqueue(new TextEncoder().encode(': keep-alive\n\n'));
        } catch {
          clearInterval(keepAlive);
          active = false;
        }
      }, 15_000);

      request.signal.addEventListener('abort', () => {
        active = false;
        clearInterval(keepAlive);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
