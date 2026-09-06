import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PostgresJsonlLog } from '@bazaar/shared';

/** Where every app's jsonlLogger writes — see packages/shared/src/log.ts. */
export const DATA_DIR = process.env.BAZAAR_DATA_DIR ?? resolve(process.cwd(), '../../data');

export interface JsonlLine {
  ts: string;
  [key: string]: unknown;
}

/** Reads a JSONL file and returns parsed lines, newest last (file order). Missing file -> []. */
export async function readJsonl(name: string): Promise<JsonlLine[]> {
  try {
    const text = await readFile(resolve(DATA_DIR, `${name}.jsonl`), 'utf8');
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as JsonlLine;
        } catch {
          return null;
        }
      })
      .filter((l): l is JsonlLine => l !== null);
  } catch {
    return [];
  }
}

/** Byte offset a stream reader has already consumed, so /api/stream can tail-follow. */
export async function readJsonlSince(name: string, fromLine = 0): Promise<{ lines: JsonlLine[]; nextLine: number }> {
  const all = await readJsonl(name);
  return { lines: all.slice(fromLine), nextLine: all.length };
}

let pgLog: Promise<PostgresJsonlLog> | undefined;

/**
 * Postgres-backed counterpart to readJsonlSince, cursor is a row id instead
 * of a line count. Used when DATABASE_URL is set so the dashboard can see a
 * buyer-agent run that happened in a *different* Railway container — see
 * apps/buyer-agent/src/index.ts and docs/STATUS.md WP13.
 */
export async function readEventsSince(app: string, afterId = 0): Promise<{ lines: JsonlLine[]; nextLine: number }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return { lines: [], nextLine: afterId };
  pgLog ??= PostgresJsonlLog.connect(databaseUrl);
  try {
    const { entries, lastId } = await (await pgLog).readSince(app, afterId);
    return { lines: entries as JsonlLine[], nextLine: lastId };
  } catch (err) {
    console.error('[readEventsSince] failed to read from Postgres', err instanceof Error ? err.message : err);
    return { lines: [], nextLine: afterId };
  }
}
