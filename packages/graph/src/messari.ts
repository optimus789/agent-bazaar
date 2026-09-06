import type { BriefMetrics } from '@bazaar/shared';
import type { GraphClient } from './client.js';
import { POOL_SNAPSHOTS_QUERY, TOP_POOLS_QUERY } from './queries/messari.js';

/**
 * Messari standardized DEX subgraph ids per chain. These are deployment ids on The Graph
 * Network and change when Messari redeploys. WP02 must verify the id in Graph Explorer
 * (schema must expose `liquidityPools`) and record the date in docs/STATUS.md.
 */
export const MESSARI_DEX_SUBGRAPHS: Record<string, string> = {
  // Candidate found via search on 2026-09-06, listed as "Uniswap V3 Base". UNVERIFIED that it is the Messari schema.
  'uniswap-v3-base': process.env.MESSARI_DEX_SUBGRAPH_ID ?? 'FUbEPQw1oMghy39fwWBFY5fE6MXPXZQtjncQy2cXdrNS',
};

export interface RawPool {
  id: string;
  name?: string | null;
  inputTokens: { id: string; symbol: string; decimals: number }[];
  totalValueLockedUSD: string;
  cumulativeVolumeUSD?: string;
  fees?: { feePercentage?: string | null; feeType?: string | null }[] | null;
}

export interface RawSnapshot {
  timestamp: string;
  totalValueLockedUSD: string;
  dailyVolumeUSD: string;
}

export interface PoolStats {
  id: string;
  name: string;
  token0: string;
  token1: string;
  tvlUsd: number;
  cumulativeVolumeUsd: number;
  feeTierBps: number;
}

/** Messari stores trading fee as a percentage string ("0.3" = 0.30%). Convert to bps. */
export function feeTierBps(fees: RawPool['fees']): number {
  const trading = fees?.find((f) => /TRADING/i.test(f.feeType ?? '')) ?? fees?.[0];
  const pct = Number(trading?.feePercentage ?? 0);
  return Number.isFinite(pct) ? Math.round(pct * 100) : 0;
}

export function toPoolStats(p: RawPool): PoolStats {
  return {
    id: p.id,
    name: p.name ?? `${p.inputTokens[0]?.symbol ?? '?'}/${p.inputTokens[1]?.symbol ?? '?'}`,
    token0: p.inputTokens[0]?.symbol ?? '?',
    token1: p.inputTokens[1]?.symbol ?? '?',
    tvlUsd: Number(p.totalValueLockedUSD),
    cumulativeVolumeUsd: Number(p.cumulativeVolumeUSD ?? 0),
    feeTierBps: feeTierBps(p.fees),
  };
}

export async function topPools(client: GraphClient, subgraphId: string, n = 10): Promise<PoolStats[]> {
  const data = await client.query<{ liquidityPools: RawPool[] }>(subgraphId, TOP_POOLS_QUERY, { n });
  return data.liquidityPools.map(toPoolStats);
}

/**
 * Turn a pool plus its last `days` daily snapshots into the metrics a brief needs.
 * Snapshots arrive newest-first.
 */
export function toBriefMetrics(pool: RawPool, snapshots: RawSnapshot[]): BriefMetrics {
  const stats = toPoolStats(pool);
  const newest = snapshots[0];
  const week = snapshots[Math.min(7, snapshots.length - 1)];
  const tvlNow = newest ? Number(newest.totalValueLockedUSD) : stats.tvlUsd;
  const tvlWeekAgo = week ? Number(week.totalValueLockedUSD) : tvlNow;
  const tvlChange7dPct = tvlWeekAgo > 0 ? ((tvlNow - tvlWeekAgo) / tvlWeekAgo) * 100 : 0;
  return {
    tvlUsd: tvlNow,
    tvlChange7dPct,
    volume24hUsd: newest ? Number(newest.dailyVolumeUSD) : 0,
    feeTierBps: stats.feeTierBps,
    token0: stats.token0,
    token1: stats.token1,
  };
}

export async function poolMetrics(client: GraphClient, subgraphId: string, poolId: string, days = 8): Promise<{ pool: PoolStats; metrics: BriefMetrics }> {
  const data = await client.query<{ liquidityPool: RawPool | null; liquidityPoolDailySnapshots: RawSnapshot[] }>(
    subgraphId,
    POOL_SNAPSHOTS_QUERY,
    { pool: poolId.toLowerCase(), days },
  );
  if (!data.liquidityPool) throw new Error(`pool not found: ${poolId}`);
  return { pool: toPoolStats(data.liquidityPool), metrics: toBriefMetrics(data.liquidityPool, data.liquidityPoolDailySnapshots) };
}
