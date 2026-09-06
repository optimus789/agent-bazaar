import { readJsonlSince, readEventsSince } from '@/lib/jsonl';

export const dynamic = 'force-dynamic';

/**
 * SSE stream tailing the buyer agent's per-tool-call decision log (see
 * apps/buyer-agent/src/agent.ts). Reads two sources and merges them:
 *  - local data/buyer.jsonl — same-container runs (local dev, `pnpm buyer`)
 *  - Postgres `bazaar_events` table (when DATABASE_URL is set) — a
 *    buyer-agent run in its OWN Railway container, which has no access to
 *    this service's local disk. See docs/STATUS.md WP13.
 * Polls both every second rather than watching, since JSONL append-writes
 * don't fire reliable fs.watch events across processes, and Postgres has no
 * push mechanism wired up here either.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let fileCursor = 0;
      let dbCursor = 0;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Replay everything that already happened so a fresh page load isn't empty.
      const [initialFile, initialDb] = await Promise.all([readJsonlSince('buyer', 0), readEventsSince('buyer', 0)]);
      for (const line of [...initialFile.lines, ...initialDb.lines]) send('entry', line);
      fileCursor = initialFile.nextLine;
      dbCursor = initialDb.nextLine;
      send('ready', { fileCursor, dbCursor });

      const interval = setInterval(async () => {
        if (closed) return;
        try {
          const [file, db] = await Promise.all([readJsonlSince('buyer', fileCursor), readEventsSince('buyer', dbCursor)]);
          fileCursor = file.nextLine;
          dbCursor = db.nextLine;
          for (const line of [...file.lines, ...db.lines]) send('entry', line);
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
