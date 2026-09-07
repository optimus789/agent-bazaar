import { fetchHederaTokenTransfers } from '@bazaar/graph';
import { HEDERA_USDC_TESTNET, parseUsdPrice, type Rail } from '@bazaar/shared';
import { readJsonl, type JsonlLine } from './jsonl.js';
import { fetchHealth, PROVIDERS } from './providers.js';
import { Pool } from 'pg';

export interface UnifiedPayment {
  ts: string;
  rail: Rail;
  /** who initiated it: 'buyer' (agent paying out) or the provider name that received it */
  side: 'buyer' | 'provider-hedera' | 'provider-arc';
  route?: string;
  amountUsd?: number;
  asset?: string;
  txId?: string;
  network?: string;
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/**
 * Real, permanent Hedera testnet transaction history for the provider's own
 * account, sourced live from the public mirror node — survives a redeploy of
 * this dashboard's container, unlike the JSONL cache below. Every real
 * payment is provider <-> buyer, so the provider's own history already
 * captures every settlement without needing to separately track buyer ids.
 */
async function liveHederaPayments(): Promise<UnifiedPayment[]> {
  const health = await fetchHealth(PROVIDERS.hedera);
  if (!health?.payTo) {
    console.error('[liveHederaPayments] fetchHealth returned no payTo — provider unreachable or /health shape changed', { url: PROVIDERS.hedera, health });
    return [];
  }
  try {
    const transfers = await fetchHederaTokenTransfers(health.payTo, HEDERA_USDC_TESTNET, { limit: 50 });
    return transfers
      .filter((t) => t.amount > 0) // provider received (positive leg); the buyer's matching negative leg is the same settlement
      .map((t) => ({
        ts: new Date(Number(t.ts.split('.')[0]) * 1000).toISOString(),
        rail: 'hedera' as const,
        side: 'provider-hedera' as const,
        amountUsd: t.amount / 1_000_000,
        asset: 'USDC',
        txId: t.txId,
        network: 'hedera:testnet',
      }));
  } catch (err) {
    // Mirror node hiccup — fall back to the JSONL cache for this render rather than blanking the page.
    console.error('[liveHederaPayments] fetchHederaTokenTransfers failed', { payTo: health.payTo, err: err instanceof Error ? err.message : err });
    return [];
  }
}

let arcPaymentsPool: Pool | undefined;

/**
 * provider-arc's payment ledger is persisted to Postgres (see
 * apps/provider-arc/src/earnings.ts PostgresLedger) specifically so it
 * survives a redeploy of that service's own container — but that data
 * lives in a different Railway container than this dashboard, so a plain
 * local readJsonl('provider-arc-payments') here always came back empty
 * (same cross-container gap WP13 fixed for the buyer's decision log,
 * left unfixed here). Read the same table directly instead.
 */
async function liveArcPayments(): Promise<UnifiedPayment[]> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return [];
  try {
    arcPaymentsPool ??= new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    const res = await arcPaymentsPool.query<{ ts: string; route: string; payer: string | null; amount_usd: number; network: string | null; transaction: string | null }>(
      'SELECT ts, route, payer, amount_usd, network, transaction FROM provider_arc_payments ORDER BY id ASC',
    );
    return res.rows.map((row) => ({
      ts: new Date(row.ts).toISOString(),
      rail: 'arc' as const,
      side: 'provider-arc' as const,
      route: row.route,
      amountUsd: row.amount_usd,
      asset: 'USDC',
      txId: row.transaction ?? undefined,
      network: row.network ?? undefined,
    }));
  } catch (err) {
    console.error('[liveArcPayments] failed to read provider_arc_payments', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Every JSONL source in the repo that represents a settled or attempted payment, plus live chain/DB data where available (see docs/STATUS.md WP11). */
export async function unifiedPayments(): Promise<UnifiedPayment[]> {
  const [buyerHedera, buyerArc, buyerGraph, providerHedera, providerHederaReceipts, liveHedera, liveArc] = await Promise.all([
    readJsonl('buyer-agent-hedera'),
    readJsonl('arc-buyer'),
    readJsonl('buyer-agent-graph'),
    readJsonl('provider-hedera'),
    readJsonl('provider-hedera-receipts'),
    liveHederaPayments(),
    liveArcPayments(),
  ]);

  const out: UnifiedPayment[] = [...liveHedera, ...liveArc];

  for (const l of buyerHedera) {
    if (l.kind !== 'hedera.payment') continue;
    out.push({ ts: l.ts, rail: 'hedera', side: 'buyer', route: str(l.url), amountUsd: num(l.priceUsd), asset: 'USDC', txId: str(l.txId) });
  }
  for (const l of buyerArc) {
    if (l.kind !== 'arc.payment') continue;
    out.push({ ts: l.ts, rail: 'arc', side: 'buyer', route: str(l.url), amountUsd: num(l.amountUsd), asset: str(l.asset), txId: str(l.txId) });
  }
  for (const l of buyerGraph) {
    if (l.kind !== 'graph.x402.query') continue;
    out.push({ ts: l.ts, rail: 'graph', side: 'buyer', route: str(l.subgraphId), amountUsd: num(l.costUsd), asset: 'USDC' });
  }
  for (const l of providerHedera) {
    if (l.kind !== 'paid.request') continue;
    // `amount`/`asset` come straight from apps/provider-hedera/src/server.ts's
    // withReceipt: when asset === 'USDC' amount is a "$0.002"-style price
    // string (parseable directly); for HBAR routes amount is instead a
    // tinybars amount with no USD rate available here, so show it as-is.
    const asset = str(l.asset);
    let amountUsd: number | undefined;
    let displayAsset = asset;
    if (asset === 'USDC' && typeof l.amount === 'string') {
      try {
        amountUsd = parseUsdPrice(l.amount);
      } catch {
        amountUsd = undefined;
      }
    } else if (asset && asset !== '?') {
      displayAsset = `${l.amount} tinybars ${asset}`;
    }
    out.push({ ts: l.ts, rail: 'hedera', side: 'provider-hedera', route: str(l.route), amountUsd, asset: displayAsset, txId: str(l.txId), network: str(l.network) });
  }
  for (const l of providerHederaReceipts) {
    if (l.kind !== 'hcs.receipt') continue;
    // `amount`/`asset` come straight from apps/provider-hedera/src/server.ts's withReceipt:
    // when asset === 'USDC' amount is a "$0.002"-style price string (parseable directly);
    // for HBAR routes amount is instead a JSON-stringified {asset, amount-in-tinybars}
    // blob with no USD rate available here, so we show tinybars as-is rather than fabricate a rate.
    const asset = str(l.asset);
    let amountUsd: number | undefined;
    let displayAsset = asset;
    if (asset === 'USDC' && typeof l.amount === 'string') {
      try {
        amountUsd = parseUsdPrice(l.amount);
      } catch {
        amountUsd = undefined;
      }
    } else if (typeof l.amount === 'string') {
      displayAsset = 'HBAR (tinybars)';
    }
    out.push({ ts: l.ts, rail: 'hedera', side: 'provider-hedera', route: str(l.route), amountUsd, asset: displayAsset, txId: str(l.txId), network: str(l.network) });
  }

  return dedupeByTxId(out).sort((a, b) => a.ts.localeCompare(b.ts));
}

/**
 * Hedera transaction ids appear in two different real string formats
 * depending on the source: the mirror node's REST API uses dashes
 * (`0.0.7162784-1788716210-213797949`), while the SDK's own `TransactionId`
 * stringifies with `@`/`.` (`0.0.7162784@1788716210.213797949`) — same
 * transaction, different serialisation. Normalise both to one shape so the
 * dedupe below actually matches them instead of double-counting every real
 * settlement (found live: without this, `/payments` showed each Hedera
 * payment twice — once from the live mirror-node read, once from JSONL).
 */
function normaliseTxId(txId: string): string {
  // 0.0.7162784-1788716210-213797949 (mirror node) and
  // 0.0.7162784@1788716210.213797949 (SDK TransactionId.toString()) name the
  // same transaction with different punctuation. Both are just four numbers
  // in order (shard, realm, account, validStartSeconds, validStartNanos) —
  // extract the digit runs and rejoin with one consistent separator so the
  // two formats compare equal regardless of which @/. shows up where.
  return txId.match(/\d+/g)?.join('-') ?? txId;
}

/**
 * The live mirror-node read and the local JSONL logs can both describe the
 * same real settlement (e.g. provider-hedera's own paid.request log has the
 * HTTP route the live-chain read cannot know). When both exist for the same
 * txId, keep whichever record has more fields filled in (prefer `route`) so
 * we get the richer JSONL data plus the live source's redeploy-survival —
 * never double-count the same real transaction in a total.
 */
function dedupeByTxId(payments: UnifiedPayment[]): UnifiedPayment[] {
  const byTxId = new Map<string, UnifiedPayment>();
  const noTxId: UnifiedPayment[] = [];
  for (const p of payments) {
    if (!p.txId) {
      noTxId.push(p);
      continue;
    }
    const key = normaliseTxId(p.txId);
    const existing = byTxId.get(key);
    if (!existing || (!existing.route && p.route)) byTxId.set(key, p);
  }
  return [...byTxId.values(), ...noTxId];
}

export interface RailTotals {
  rail: Rail;
  count: number;
  totalUsd: number;
}

export function totalsByRail(payments: UnifiedPayment[]): RailTotals[] {
  const map = new Map<Rail, RailTotals>();
  for (const p of payments) {
    if (p.amountUsd === undefined) continue;
    const cur = map.get(p.rail) ?? { rail: p.rail, count: 0, totalUsd: 0 };
    cur.count += 1;
    cur.totalUsd += p.amountUsd;
    map.set(p.rail, cur);
  }
  return [...map.values()];
}

export function explorerUrlFor(rail: Rail, txId: string | undefined, network: string | undefined): string | undefined {
  if (!txId) return undefined;
  if (rail === 'hedera') return `https://hashscan.io/testnet/transaction/${txId}`;
  if (rail === 'arc') return `https://testnet.arcscan.app/tx/${txId}`;
  if (rail === 'graph') return network === 'base' ? `https://basescan.org/tx/${txId}` : `https://sepolia.basescan.org/tx/${txId}`;
  return undefined;
}

export type { JsonlLine };
