import { parseUsdPrice, type Rail } from '@bazaar/shared';
import { readJsonl, type JsonlLine } from './jsonl.js';

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

/** Every JSONL source in the repo that represents a settled or attempted payment. */
export async function unifiedPayments(): Promise<UnifiedPayment[]> {
  const [buyerHedera, buyerArc, buyerGraph, providerHedera, providerHederaReceipts, providerArc] = await Promise.all([
    readJsonl('buyer-agent-hedera'),
    readJsonl('arc-buyer'),
    readJsonl('buyer-agent-graph'),
    readJsonl('provider-hedera'),
    readJsonl('provider-hedera-receipts'),
    readJsonl('provider-arc-payments'),
  ]);

  const out: UnifiedPayment[] = [];

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
    out.push({ ts: l.ts, rail: 'hedera', side: 'provider-hedera', route: str(l.route), txId: str(l.txId), network: str(l.network) });
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
  for (const l of providerArc) {
    if (l.kind !== 'paid.request') continue;
    out.push({ ts: l.ts, rail: 'arc', side: 'provider-arc', route: str(l.route), amountUsd: num(l.amountUsd), asset: 'USDC', txId: str(l.transaction), network: str(l.network) });
  }

  return out.sort((a, b) => a.ts.localeCompare(b.ts));
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
