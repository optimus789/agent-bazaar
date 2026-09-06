import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostgresJsonlLog, jsonlLoggerWithPostgres } from '../src/log.js';

let tmpRoot: string | undefined;
afterEach(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
  tmpRoot = undefined;
});

describe('PostgresJsonlLog', () => {
  it('creates the table, writes events per app, and reads them back since a given id', async () => {
    const rows: { id: number; app: string; ts: string; event: string }[] = [];
    let nextId = 1;
    const queries: { text: string; values?: unknown[] }[] = [];
    const mockPool = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        queries.push({ text, values });
        if (text.startsWith('INSERT')) {
          const [app, ts, event] = values as [string, string, string];
          rows.push({ id: nextId++, app, ts, event });
          return { rows: [] };
        }
        if (text.startsWith('SELECT')) {
          const [app, afterId] = values as [string, number];
          const matched = rows.filter((r) => r.app === app && r.id > afterId).map((r) => ({ id: r.id, event: JSON.parse(r.event) }));
          return { rows: matched };
        }
        return { rows: [] };
      }),
    };
    vi.doMock('pg', () => ({ Pool: vi.fn(() => mockPool) }));

    const log = await PostgresJsonlLog.connect('postgres://fake');
    await log.write('buyer', { toolCall: { name: 'discover_providers' } });
    await log.write('buyer', { toolCall: { name: 'buy_hedera' } });

    const { entries, lastId } = await log.readSince('buyer', 0);
    expect(entries).toHaveLength(2);
    expect((entries[0] as { toolCall: { name: string } }).toolCall.name).toBe('discover_providers');
    expect(lastId).toBe(2);

    const { entries: onlySecond } = await log.readSince('buyer', 1);
    expect(onlySecond).toHaveLength(1);
    expect((onlySecond[0] as { toolCall: { name: string } }).toolCall.name).toBe('buy_hedera');

    vi.doUnmock('pg');
  });

  it('does not throw when a DB write fails', async () => {
    const mockPool = { query: vi.fn(async (text: string) => (text.startsWith('INSERT') ? Promise.reject(new Error('connection reset')) : { rows: [] })) };
    vi.doMock('pg', () => ({ Pool: vi.fn(() => mockPool) }));

    const log = await PostgresJsonlLog.connect('postgres://fake');
    await expect(log.write('buyer', { toolCall: { name: 'x' } })).resolves.not.toThrow();

    vi.doUnmock('pg');
  });
});

describe('jsonlLoggerWithPostgres', () => {
  it('always writes locally, and also to Postgres when provided', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'bazaar-log-test-'));
    const pgWrite = vi.fn(async () => undefined);
    const pgLog = { write: pgWrite } as unknown as PostgresJsonlLog;

    const log = jsonlLoggerWithPostgres('buyer', pgLog, tmpRoot);
    await log.write({ step: 0 });

    expect(pgWrite).toHaveBeenCalledWith('buyer', { step: 0 });
    const fileContent = await readFile(join(tmpRoot, 'buyer.jsonl'), 'utf8');
    expect(JSON.parse(fileContent.trim())).toMatchObject({ step: 0 });
  });

  it('skips Postgres entirely when no pgLog is given', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'bazaar-log-test-'));
    const log = jsonlLoggerWithPostgres('buyer', undefined, tmpRoot);
    await expect(log.write({ step: 0 })).resolves.not.toThrow();
  });
});
