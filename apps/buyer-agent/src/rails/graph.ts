import { GRAPH_X402_PRICE_USD, jsonlLogger, type PaymentReceipt } from '@bazaar/shared';
import { X402GraphClient, type GraphClient } from '@bazaar/graph';

export interface GraphRailOptions {
  privateKey: `0x${string}`;
  env?: 'testnet' | 'production';
  log?: ReturnType<typeof jsonlLogger>;
}

export interface GraphRail {
  readonly client: GraphClient;
  /** costUsd is nominal for testnet ($0.01 is the production price; testnet settles the same client-side flow at no real cost signal from the gateway) */
  query<T = unknown>(subgraphId: string, document: string, variables?: Record<string, unknown>): Promise<{ data: T; receipt: PaymentReceipt }>;
}

/** Pays The Graph's x402 gateway per query — no API key, agent pays autonomously. */
export function makeGraphRail(opts: GraphRailOptions): GraphRail {
  const log = opts.log ?? jsonlLogger('buyer-agent-graph');
  const env = opts.env ?? 'testnet';
  const client = new X402GraphClient({ privateKey: opts.privateKey, env, log });

  return {
    client,
    async query<T = unknown>(subgraphId: string, document: string, variables?: Record<string, unknown>) {
      const data = await client.query<T>(subgraphId, document, variables);
      const receipt: PaymentReceipt = {
        rail: 'graph',
        chain: 'base',
        amountUsd: env === 'production' ? GRAPH_X402_PRICE_USD : 0.01,
        asset: 'USDC',
        url: subgraphId,
        ts: new Date().toISOString(),
      };
      return { data, receipt };
    },
  };
}
