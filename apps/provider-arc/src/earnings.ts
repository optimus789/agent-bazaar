import { jsonlLogger } from '@bazaar/shared';
import type { Pool } from 'pg';

export interface PaymentRecord {
  ts: string;
  route: string;
  payer?: string;
  amountUsd: number;
  network?: string;
  transaction?: string;
}

export interface EarningsSnapshot {
  totalPayments: number;
  totalUsd: number;
  recent: PaymentRecord[];
}

/**
 * In-memory + JSONL log of settled payments this process has seen. Not a
 * substitute for `GatewayClient.getBalances()` (the source of truth for
 * withdrawable balance) — this is the "list of payments" half of GET /v1/seller/earnings.
 *
 * This resets whenever the process restarts, including a PaaS container
 * redeploy — confirmed live on Railway (see docs/STATUS.md WP12). Circle's
 * own Nanopayments API has no payment-history endpoint to fall back on
 * (nanopayments settle in batches, off-chain until then), so — same as the
 * official Arc Nanopayments reference app, which uses Supabase/Postgres for
 * this exact reason — a provider that needs its history to survive restarts
 * has no choice but to persist it itself. Use `PostgresLedger` for that; this
 * class stays as the zero-dependency default for local dev/tests/MOCK mode.
 */
export class Ledger {
  protected readonly records: PaymentRecord[] = [];
  private readonly log: ReturnType<typeof jsonlLogger>;

  constructor(log: ReturnType<typeof jsonlLogger> = jsonlLogger('provider-arc-payments')) {
    this.log = log;
  }

  async record(entry: PaymentRecord): Promise<void> {
    this.records.push(entry);
    await this.log.write({ kind: 'paid.request', ...entry });
  }

  snapshot(limit = 50): EarningsSnapshot {
    const totalUsd = this.records.reduce((sum, r) => sum + r.amountUsd, 0);
    return { totalPayments: this.records.length, totalUsd, recent: this.records.slice(-limit).reverse() };
  }
}

/**
 * Same interface as `Ledger`, backed by Postgres so the payment list survives
 * a redeploy. Still keeps an in-memory copy + JSONL write (via the parent
 * class) so a transient DB hiccup degrades to the old behaviour rather than
 * losing the record entirely; `snapshot()` still reads from memory for a
 * fast, synchronous response — the DB is for durability across restarts,
 * not for serving reads.
 */
export class PostgresLedger extends Ledger {
  private constructor(
    log: ReturnType<typeof jsonlLogger> | undefined,
    private readonly pool: Pool,
  ) {
    super(log);
  }

  static async connect(databaseUrl: string, log?: ReturnType<typeof jsonlLogger>): Promise<PostgresLedger> {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS provider_arc_payments (
        id BIGSERIAL PRIMARY KEY,
        ts TIMESTAMPTZ NOT NULL,
        route TEXT NOT NULL,
        payer TEXT,
        amount_usd DOUBLE PRECISION NOT NULL,
        network TEXT,
        transaction TEXT
      )
    `);
    const ledger = new PostgresLedger(log, pool);
    await ledger.loadFromDb();
    return ledger;
  }

  private async loadFromDb(): Promise<void> {
    const res = await this.pool.query<{ ts: string; route: string; payer: string | null; amount_usd: number; network: string | null; transaction: string | null }>(
      'SELECT ts, route, payer, amount_usd, network, transaction FROM provider_arc_payments ORDER BY id ASC',
    );
    for (const row of res.rows) {
      this.records.push({
        ts: new Date(row.ts).toISOString(),
        route: row.route,
        payer: row.payer ?? undefined,
        amountUsd: row.amount_usd,
        network: row.network ?? undefined,
        transaction: row.transaction ?? undefined,
      });
    }
  }

  override async record(entry: PaymentRecord): Promise<void> {
    await super.record(entry);
    try {
      await this.pool.query(
        'INSERT INTO provider_arc_payments (ts, route, payer, amount_usd, network, transaction) VALUES ($1, $2, $3, $4, $5, $6)',
        [entry.ts, entry.route, entry.payer ?? null, entry.amountUsd, entry.network ?? null, entry.transaction ?? null],
      );
    } catch (err) {
      // Same "don't lose the payment record over a transient failure"
      // principle as the base class's JSONL write — the in-memory record
      // (already pushed by super.record) and JSONL line still exist even if
      // this DB write fails, so a redeploy right after a DB hiccup could
      // still lose this one entry, but a live request never fails because
      // of it.
      console.error('[PostgresLedger] failed to persist payment record', err instanceof Error ? err.message : err);
    }
  }
}
