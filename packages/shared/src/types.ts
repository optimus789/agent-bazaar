import type { ChainKey } from './chains.js';

export type Rail = 'hedera' | 'arc' | 'graph';

/** A paid route a provider advertises in its catalog and registration file. */
export interface CatalogRoute {
  method: 'GET' | 'POST';
  path: string;
  priceUsd: number;
  /** Alternative explicit-asset price, e.g. HBAR in tinybars. */
  altPrice?: { asset: string; amount: string };
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface ProviderListing {
  /** "<chainId>:<agentId>" as used by Agent0 subgraphs */
  id: string;
  chain: ChainKey;
  agentId: string;
  owner: string;
  name: string;
  description: string;
  rail: Rail;
  baseUrl: string;
  routes: CatalogRoute[];
  x402Support: boolean;
  totalFeedback: number;
  /** 0–100 average of recorded feedback, undefined when none */
  avgScore?: number;
  validations: number;
}

export interface PaymentReceipt {
  rail: Rail;
  chain: ChainKey | 'base';
  amountUsd: number;
  asset: string;
  txId?: string;
  explorerUrl?: string;
  url: string;
  ts: string;
}

export interface BriefMetrics {
  tvlUsd: number;
  tvlChange7dPct: number;
  volume24hUsd: number;
  feeTierBps: number;
  token0: string;
  token1: string;
  /** share of TVL held by the largest position bucket if known, 0–1 */
  concentration?: number;
}

export interface Brief {
  subject: string;
  riskScore: number; // 0–100, higher is riskier
  reasons: string[];
  summary: string;
  metrics: BriefMetrics;
  generatedAt: string;
}

export interface RankedProvider extends ProviderListing {
  score: number;
  rationale: string;
  priceUsdForTask: number;
}
