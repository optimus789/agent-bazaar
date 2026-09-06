import type { Brief, BriefMetrics } from '@bazaar/shared';
import { z } from 'zod';

export interface RiskAssessment {
  score: number;
  reasons: string[];
}

/**
 * Deterministic risk score, 0 (calm) to 100 (fragile). It is the part judges can
 * audit, and it is what the LLM is asked to explain, never to override.
 */
export function riskScore(m: BriefMetrics): RiskAssessment {
  let score = 20;
  const reasons: string[] = [];

  if (m.tvlUsd < 1_000_000) {
    score += 30;
    reasons.push(`thin liquidity: TVL $${fmt(m.tvlUsd)}`);
  } else if (m.tvlUsd < 10_000_000) {
    score += 12;
    reasons.push(`moderate liquidity: TVL $${fmt(m.tvlUsd)}`);
  } else {
    reasons.push(`deep liquidity: TVL $${fmt(m.tvlUsd)}`);
  }

  if (m.tvlChange7dPct <= -25) {
    score += 30;
    reasons.push(`TVL fell ${m.tvlChange7dPct.toFixed(1)}% in 7d (capital leaving)`);
  } else if (m.tvlChange7dPct <= -10) {
    score += 15;
    reasons.push(`TVL down ${m.tvlChange7dPct.toFixed(1)}% in 7d`);
  } else if (m.tvlChange7dPct >= 50) {
    score += 10;
    reasons.push(`TVL up ${m.tvlChange7dPct.toFixed(1)}% in 7d (fresh, unproven capital)`);
  } else {
    reasons.push(`TVL stable (${m.tvlChange7dPct >= 0 ? '+' : ''}${m.tvlChange7dPct.toFixed(1)}% 7d)`);
  }

  const turnover = m.tvlUsd > 0 ? m.volume24hUsd / m.tvlUsd : 0;
  if (turnover > 3) {
    score += 15;
    reasons.push(`very high turnover ${turnover.toFixed(2)}x/day (volatile pair or wash risk)`);
  } else if (turnover < 0.05) {
    score += 10;
    reasons.push(`low turnover ${turnover.toFixed(3)}x/day (fees will not cover IL)`);
  } else {
    reasons.push(`healthy turnover ${turnover.toFixed(2)}x/day`);
  }

  if (m.concentration !== undefined && m.concentration > 0.5) {
    score += 10;
    reasons.push(`liquidity concentrated: ${(m.concentration * 100).toFixed(0)}% in one bucket`);
  }

  const stable = /USD|DAI|USDT|USDC|EUR/i;
  if (stable.test(m.token0) && stable.test(m.token1)) {
    score -= 15;
    reasons.push('stable/stable pair: low price risk');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/** Annualised fee APR estimate = 24h volume × fee tier × 365 / TVL. */
export function feeAprPct(m: BriefMetrics): number {
  if (m.tvlUsd <= 0) return 0;
  return ((m.volume24hUsd * (m.feeTierBps / 10_000) * 365) / m.tvlUsd) * 100;
}

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(0);
}

export const BriefSchema = z.object({
  subject: z.string(),
  riskScore: z.number().min(0).max(100),
  reasons: z.array(z.string()).min(1),
  summary: z.string().min(40),
  metrics: z.object({
    tvlUsd: z.number(),
    tvlChange7dPct: z.number(),
    volume24hUsd: z.number(),
    feeTierBps: z.number(),
    token0: z.string(),
    token1: z.string(),
    concentration: z.number().optional(),
  }),
  generatedAt: z.string(),
});

/** Narrator: given metrics and the audited score, produce the prose. Injected so tests and MOCK runs stay offline. */
export type Narrator = (input: { subject: string; metrics: BriefMetrics; assessment: RiskAssessment; feeAprPct: number }) => Promise<string>;

export const templateNarrator: Narrator = async ({ subject, metrics, assessment, feeAprPct: apr }) => {
  const verdict = assessment.score >= 70 ? 'high risk' : assessment.score >= 40 ? 'moderate risk' : 'low risk';
  return (
    `${subject} screens as ${verdict} (score ${assessment.score}/100). ` +
    `TVL is $${fmt(metrics.tvlUsd)} (${metrics.tvlChange7dPct >= 0 ? '+' : ''}${metrics.tvlChange7dPct.toFixed(1)}% over 7 days) ` +
    `with $${fmt(metrics.volume24hUsd)} traded in the last 24h at a ${metrics.feeTierBps} bps fee tier, ` +
    `implying roughly ${apr.toFixed(1)}% annualised fee yield before impermanent loss. ` +
    `Key factors: ${assessment.reasons.join('; ')}.`
  );
};

export async function buildBrief(subject: string, metrics: BriefMetrics, narrate: Narrator = templateNarrator): Promise<Brief> {
  const assessment = riskScore(metrics);
  const apr = feeAprPct(metrics);
  const summary = await narrate({ subject, metrics, assessment, feeAprPct: apr });
  const brief: Brief = { subject, riskScore: assessment.score, reasons: assessment.reasons, summary, metrics, generatedAt: new Date().toISOString() };
  return BriefSchema.parse(brief);
}
