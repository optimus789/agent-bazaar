import { describe, expect, it, vi } from 'vitest';
import { Ledger, PostgresLedger } from '../src/earnings.js';

function fakeLog() {
  const writes: unknown[] = [];
  return { write: vi.fn(async (entry: unknown) => void writes.push(entry)), writes, file: 'test.jsonl' } as never;
}

describe('Ledger (in-memory + JSONL, unchanged default)', () => {
  it('records and snapshots payments', async () => {
    const ledger = new Ledger(fakeLog());
    await ledger.record({ ts: '2026-01-01T00:00:00Z', route: 'POST /x', amountUsd: 0.001, transaction: 'tx1' });
    await ledger.record({ ts: '2026-01-01T00:00:01Z', route: 'POST /y', amountUsd: 0.002, transaction: 'tx2' });
    const snap = ledger.snapshot();
    expect(snap.totalPayments).toBe(2);
    expect(snap.totalUsd).toBeCloseTo(0.003);
    expect(snap.recent[0]?.transaction).toBe('tx2'); // most recent first
  });
});

describe('PostgresLedger', () => {
  it('creates the table, loads existing rows, and persists new records', async () => {
    const existingRows = [{ ts: '2026-01-01T00:00:00.000Z', route: 'POST /old', payer: '0xabc', amount_usd: 0.005, network: 'arc-testnet', transaction: 'old-tx' }];
    const queries: { text: string; values?: unknown[] }[] = [];
    const mockPool = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        queries.push({ text, values });
        if (text.startsWith('SELECT')) return { rows: existingRows };
        return { rows: [] };
      }),
    };
    vi.doMock('pg', () => ({ Pool: vi.fn(() => mockPool) }));

    const ledger = await PostgresLedger.connect('postgres://fake', fakeLog());

    // Existing row from the DB is loaded into the in-memory snapshot immediately.
    const initialSnapshot = ledger.snapshot();
    expect(initialSnapshot.totalPayments).toBe(1);
    expect(initialSnapshot.recent[0]?.transaction).toBe('old-tx');

    await ledger.record({ ts: '2026-01-02T00:00:00Z', route: 'POST /new', amountUsd: 0.001, transaction: 'new-tx' });

    const afterSnapshot = ledger.snapshot();
    expect(afterSnapshot.totalPayments).toBe(2);
    expect(afterSnapshot.recent[0]?.transaction).toBe('new-tx');

    const insertCall = queries.find((q) => q.text.startsWith('INSERT'));
    expect(insertCall?.values).toEqual(['2026-01-02T00:00:00Z', 'POST /new', null, 0.001, null, 'new-tx']);

    vi.doUnmock('pg');
  });

  it('does not throw when a DB write fails — the in-memory/JSONL record still succeeds', async () => {
    const mockPool = {
      query: vi.fn(async (text: string) => {
        if (text.startsWith('SELECT')) return { rows: [] };
        if (text.startsWith('INSERT')) throw new Error('connection reset');
        return { rows: [] };
      }),
    };
    vi.doMock('pg', () => ({ Pool: vi.fn(() => mockPool) }));

    const ledger = await PostgresLedger.connect('postgres://fake', fakeLog());
    await expect(ledger.record({ ts: '2026-01-01T00:00:00Z', route: 'POST /x', amountUsd: 0.001 })).resolves.not.toThrow();
    expect(ledger.snapshot().totalPayments).toBe(1); // still recorded in memory despite the DB failure

    vi.doUnmock('pg');
  });
});
