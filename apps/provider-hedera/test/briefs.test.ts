import { describe, expect, it } from 'vitest';
import type { BriefMetrics } from '@bazaar/shared';
import { buildBrief, feeAprPct, riskScore } from '../src/briefs.js';

const base: BriefMetrics = { tvlUsd: 48_000_000, tvlChange7dPct: -2, volume24hUsd: 150_000_000, feeTierBps: 5, token0: 'WETH', token1: 'USDC' };

describe('riskScore', () => {
  it('is deterministic and bounded', () => {
    const a = riskScore(base);
    const b = riskScore(base);
    expect(a).toEqual(b);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
    expect(a.reasons.length).toBeGreaterThan(0);
  });
  it('penalises thin, draining pools and rewards deep stable ones', () => {
    const thin = riskScore({ ...base, tvlUsd: 200_000, tvlChange7dPct: -40, volume24hUsd: 1_000 });
    const calm = riskScore(base);
    const stable = riskScore({ ...base, token0: 'USDC', token1: 'USDT', volume24hUsd: 20_000_000 });
    expect(thin.score).toBeGreaterThan(calm.score);
    expect(stable.score).toBeLessThan(calm.score);
    expect(thin.reasons.join(' ')).toMatch(/thin liquidity/);
    expect(thin.reasons.join(' ')).toMatch(/capital leaving/);
  });
  it('flags excessive turnover', () => {
    const r = riskScore({ ...base, tvlUsd: 1_000_000, volume24hUsd: 5_000_000 });
    expect(r.reasons.join(' ')).toMatch(/very high turnover/);
  });
});

describe('feeAprPct', () => {
  it('computes volume × fee × 365 / tvl', () => {
    // 150M × 0.0005 × 365 / 48M ≈ 57%
    expect(feeAprPct(base)).toBeCloseTo(57.03, 1);
    expect(feeAprPct({ ...base, tvlUsd: 0 })).toBe(0);
  });
});

describe('buildBrief', () => {
  it('produces a schema-valid brief with the template narrator', async () => {
    const brief = await buildBrief('WETH/USDC 0.05% on base', base);
    expect(brief.riskScore).toBe(riskScore(base).score);
    expect(brief.summary).toMatch(/annualised fee yield/);
    expect(brief.metrics.token0).toBe('WETH');
  });
  it('accepts a custom narrator but keeps the audited score', async () => {
    const brief = await buildBrief('x', base, async () => 'a'.repeat(50));
    expect(brief.summary).toBe('a'.repeat(50));
    expect(brief.riskScore).toBe(riskScore(base).score);
  });
});
