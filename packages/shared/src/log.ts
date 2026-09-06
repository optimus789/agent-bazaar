import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/** Append-only JSONL logger. Every app writes to data/<app>.jsonl at the repo root. */
export function jsonlLogger(app: string, root = process.env.BAZAAR_DATA_DIR ?? resolve(process.cwd(), '../../data')) {
  const file = resolve(root, `${app}.jsonl`);
  let ready: Promise<void> | undefined;
  return {
    file,
    async write(event: Record<string, unknown>): Promise<void> {
      ready ??= mkdir(dirname(file), { recursive: true }).then(() => undefined);
      await ready;
      await appendFile(file, JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n');
    },
  };
}
