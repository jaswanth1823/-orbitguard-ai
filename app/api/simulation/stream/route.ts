// ============================================================
// GET /api/simulation/stream?id=<spacecraft_id>
//
// Server-Sent Events endpoint. Streams one SimTelemetry JSON
// object per second while the simulation is running.
//
// The simulation is auto-started on the first SSE connection
// if it is not already running (convenient for the UI).
//
// Client usage:
//   const es = new EventSource('/api/simulation/stream?id=ORBIT-01');
//   es.addEventListener('telemetry', e => {
//     const t = JSON.parse(e.data);
//     // update UI with t: SimTelemetry
//   });
//   es.addEventListener('status', e => { ... });
// ============================================================

import { getSimulationEngine } from '@/lib/telemetry-simulation';
import type { SimTelemetry } from '@/lib/telemetry-simulation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id') ?? 'ORBIT-01';

  const engine = getSimulationEngine(id);

  // Auto-start the engine if it isn't running yet
  if (!engine.running) {
    engine.start();
  }

  // Create a readable stream backed by the engine's subscribe callback
  const stream = new ReadableStream({
    start(controller) {
      // Helper to write an SSE event
      function send(event: string, data: unknown) {
        const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(new TextEncoder().encode(line));
      }

      // Announce the stream is open
      send('status', {
        ok: true,
        spacecraft_id: id,
        running: engine.running,
        message: 'Telemetry stream connected',
      });

      // Subscribe to live ticks
      const unsub = engine.subscribe((t: SimTelemetry) => {
        try {
          send('telemetry', t);
        } catch {
          // Controller may be closed; unsub below handles cleanup
        }
      });

      // Keep-alive comment every 15 s to prevent proxy timeouts
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': keep-alive\n\n'));
        } catch {
          clearInterval(keepAlive);
        }
      }, 15_000);

      // Clean up when client disconnects
      request.signal.addEventListener('abort', () => {
        unsub();
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
      'X-Accel-Buffering': 'no', // disable nginx buffering
    },
  });
}
