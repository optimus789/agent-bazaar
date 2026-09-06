import { readJsonlSince } from '@/lib/jsonl';

export const dynamic = 'force-dynamic';

/**
 * SSE stream tailing data/buyer.jsonl (the buyer agent's per-tool-call decision
 * log — see apps/buyer-agent/src/agent.ts). Polls the file every second rather
 * than watching it, since JSONL append-writes on most filesystems don't fire
 * reliable fs.watch events across processes.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let cursor = 0;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Replay everything that already happened so a fresh page load isn't empty.
      const initial = await readJsonlSince('buyer', 0);
      for (const line of initial.lines) send('entry', line);
      cursor = initial.nextLine;
      send('ready', { cursor });

      const interval = setInterval(async () => {
        if (closed) return;
        try {
          const { lines, nextLine } = await readJsonlSince('buyer', cursor);
          cursor = nextLine;
          for (const line of lines) send('entry', line);
        } catch {
          /* transient read errors are fine; try again next tick */
        }
      }, 1000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
