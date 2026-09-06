import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Pool } from 'pg';

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

export interface JsonlEntry {
  ts: string;
  app: string;
  event: Record<string, unknown>;
}

/**
 * Postgres-backed counterpart to `jsonlLogger`, for logs that need to be read
 * back by a *different* process/container than the one writing them — e.g.
 * the buyer-agent's decision log, which the dashboard's `/api/stream` route
 * tails. On a PaaS host each service is its own container with its own local
 * disk, so a JSONL file written by buyer-agent is invisible to the dashboard
 * service even if both are deployed from the same repo (see docs/STATUS.md
 * WP13). One shared `events` table, keyed by `app`, replaces the per-app
 * JSONL file for any log that needs cross-service visibility; same
 * "never let a DB hiccup break the caller" principle as provider-arc's
 * `PostgresLedger`.
 */
export class PostgresJsonlLog {
  private constructor(private readonly pool: Pool) {}

  static async connect(databaseUrl: string): Promise<PostgresJsonlLog> {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bazaar_events (
        id BIGSERIAL PRIMARY KEY,
        app TEXT NOT NULL,
        ts TIMESTAMPTZ NOT NULL,
        event JSONB NOT NULL
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS bazaar_events_app_id_idx ON bazaar_events (app, id)`);
    return new PostgresJsonlLog(pool);
  }

  async write(app: string, event: Record<string, unknown>): Promise<void> {
    const ts = new Date().toISOString();
    try {
      await this.pool.query('INSERT INTO bazaar_events (app, ts, event) VALUES ($1, $2, $3)', [app, ts, JSON.stringify({ ts, ...event })]);
    } catch (err) {
      console.error('[PostgresJsonlLog] failed to persist event', err instanceof Error ? err.message : err);
    }
  }

  async readSince(app: string, afterId = 0): Promise<{ entries: (Record<string, unknown> & { ts: string })[]; lastId: number }> {
    const res = await this.pool.query<{ id: number; event: Record<string, unknown> & { ts: string } }>(
      'SELECT id, event FROM bazaar_events WHERE app = $1 AND id > $2 ORDER BY id ASC',
      [app, afterId],
    );
    const lastId = res.rows.length ? res.rows[res.rows.length - 1]!.id : afterId;
    return { entries: res.rows.map((r) => r.event), lastId };
  }
}

/** Wraps `jsonlLogger` to also dual-write to Postgres when `databaseUrl` is set — JSONL stays the local/dev default, Postgres is what makes the log visible cross-service. */
export function jsonlLoggerWithPostgres(app: string, pgLog: PostgresJsonlLog | undefined, root?: string) {
  const local = jsonlLogger(app, root);
  return {
    file: local.file,
    async write(event: Record<string, unknown>): Promise<void> {
      await local.write(event);
      if (pgLog) await pgLog.write(app, event);
    },
  };
}
