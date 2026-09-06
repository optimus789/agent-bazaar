import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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
