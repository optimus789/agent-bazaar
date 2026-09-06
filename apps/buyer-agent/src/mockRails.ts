import type { PaymentReceipt } from '@bazaar/shared';
import type { GraphClient } from '@bazaar/graph';
import type { HederaRail } from './rails/hedera.js';
import type { ArcRail } from './rails/arc.js';
import type { GraphRail } from './rails/graph.js';

/** Deterministic, network-free rails for `--mock` runs and tests. */
export function makeMockHederaRail(): HederaRail {
  return {
    async pay<T = unknown>(_url: string, _body: unknown, priceUsd: number) {
      const receipt: PaymentReceipt = { rail: 'hedera', chain: 'hedera-testnet', amountUsd: priceUsd, asset: 'USDC', txId: '0.0.0@mock', url: _url, ts: new Date().toISOString() };
      return { data: { mock: true } as T, receipt };
    },
  };
}

export function makeMockArcRail(): ArcRail {
  return {
    buyer: undefined as unknown as ArcRail['buyer'],
    async pay<T = unknown>(url: string, _body: unknown) {
      const receipt: PaymentReceipt = { rail: 'arc', chain: 'arc-testnet', amountUsd: 0.0005, asset: 'USDC', txId: '0xmock', url, ts: new Date().toISOString() };
      return { data: { mock: true } as T, receipt };
    },
  };
}

export function makeMockGraphRail(graphClient: GraphClient): GraphRail {
  return {
    client: graphClient,
    async query<T = unknown>(subgraphId: string) {
      const receipt: PaymentReceipt = { rail: 'graph', chain: 'base', amountUsd: 0.01, asset: 'USDC', url: subgraphId, ts: new Date().toISOString() };
      return { data: {} as T, receipt };
    },
  };
}
