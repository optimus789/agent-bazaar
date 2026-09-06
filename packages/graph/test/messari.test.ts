import { describe, expect, it } from 'vitest';
import { fixtureClient } from '../src/fixtures.js';
import { feeTierBps, MESSARI_DEX_SUBGRAPHS, poolMetrics, toBriefMetrics, topPools } from '../src/messari.js';

const SG = MESSARI_DEX_SUBGRAPHS['uniswap-v3-base']!;

describe('feeTierBps', () => {
  it('converts Messari percentage strings to bps', () => {
    expect(feeTierBps([{ feePercentage: '0.05', feeType: 'FIXED_TRADING_FEE' }])).toBe(5);
    expect(feeTierBps([{ feePercentage: '0.3', feeType: 'FIXED_TRADING_FEE' }])).toBe(30);
    expect(feeTierBps([{ feePercentage: '0.1', feeType: 'FIXED_PROTOCOL_FEE' }, { feePercentage: '1', feeType: 'FIXED_TRADING_FEE' }])).toBe(100);
    expect(feeTierBps(null)).toBe(0);
  });
});

describe('topPools', () => {
  it('normalises pools ordered by TVL', async () => {
    const pools = await topPools(fixtureClient(), SG, 2);
    expect(pools).toHaveLength(2);
    expect(pools[0]).toMatchObject({ token0: 'WETH', token1: 'USDC', feeTierBps: 5 });
    expect(pools[0]!.tvlUsd).toBeGreaterThan(pools[1]!.tvlUsd);
  });
});

describe('toBriefMetrics / poolMetrics', () => {
  it('computes 7d TVL change and 24h volume from newest-first snapshots', async () => {
    const { metrics, pool } = await poolMetrics(fixtureClient(), SG, '0xD0B53D9277642D899DF5C87A3966A349A798F224');
    expect(pool.name).toContain('WETH/USDC');
    expect(metrics.volume24hUsd).toBe(154_000_000);
    expect(metrics.tvlUsd).toBeCloseTo(48_213_456.12);
    // 48.21M vs 53.6M a week earlier → about -10%
    expect(metrics.tvlChange7dPct).toBeLessThan(-9);
    expect(metrics.tvlChange7dPct).toBeGreaterThan(-11);
  });
  it('handles a pool with no snapshots', () => {
    const m = toBriefMetrics(
      { id: 'x', inputTokens: [{ id: 'a', symbol: 'A', decimals: 18 }, { id: 'b', symbol: 'B', decimals: 18 }], totalValueLockedUSD: '100', fees: [] },
      [],
    );
    expect(m).toMatchObject({ tvlUsd: 100, tvlChange7dPct: 0, volume24hUsd: 0, feeTierBps: 0 });
  });
});
