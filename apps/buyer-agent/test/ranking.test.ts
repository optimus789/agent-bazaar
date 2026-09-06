import { describe, expect, it } from 'vitest';
import type { ProviderListing } from '@bazaar/shared';
import { cheapestPriceUsd, DEFAULT_WEIGHTS, rankProviders } from '../src/ranking.js';

function listing(overrides: Partial<ProviderListing> = {}): ProviderListing {
  return {
    id: '84532:1',
    chain: 'base-sepolia',
    agentId: '1',
    owner: '0x0',
    name: 'Provider',
    description: '',
    rail: 'hedera',
    baseUrl: 'http://x',
    routes: [{ method: 'POST', path: '/v1/brief', priceUsd: 0.002, description: '' }],
    x402Support: true,
    totalFeedback: 5,
    avgScore: 80,
    validations: 1,
    ...overrides,
  };
}

describe('cheapestPriceUsd', () => {
  it('picks the minimum priced route', () => {
    const l = listing({ routes: [{ method: 'POST', path: '/a', priceUsd: 0.02, description: '' }, { method: 'POST', path: '/b', priceUsd: 0.002, description: '' }] });
    expect(cheapestPriceUsd(l)).toBe(0.002);
  });
  it('is undefined for a listing with no routes', () => {
    expect(cheapestPriceUsd(listing({ routes: [] }))).toBeUndefined();
  });
});

describe('rankProviders', () => {
  it('ranks a well-reputed, cheap, validated provider above an expensive unvalidated one', () => {
    const good = listing({ name: 'good', avgScore: 90, validations: 2, routes: [{ method: 'POST', path: '/a', priceUsd: 0.001, description: '' }] });
    const bad = listing({ name: 'bad', avgScore: 20, validations: 0, totalFeedback: 3, routes: [{ method: 'POST', path: '/a', priceUsd: 0.018, description: '' }] });
    const [first, second] = rankProviders([bad, good], 0.02);
    expect(first!.name).toBe('good');
    expect(second!.name).toBe('bad');
    expect(first!.score).toBeGreaterThan(second!.score);
  });

  it('providers whose cheapest route exceeds the budget rank last with score -Infinity', () => {
    const affordable = listing({ name: 'affordable', routes: [{ method: 'POST', path: '/a', priceUsd: 0.005, description: '' }] });
    const tooExpensive = listing({ name: 'expensive', avgScore: 100, validations: 5, routes: [{ method: 'POST', path: '/a', priceUsd: 0.05, description: '' }] });
    const ranked = rankProviders([tooExpensive, affordable], 0.01);
    expect(ranked[0]!.name).toBe('affordable');
    expect(ranked[1]!.name).toBe('expensive');
    expect(ranked[1]!.score).toBe(-Infinity);
    expect(ranked[1]!.rationale).toMatch(/exceeds budget/);
  });

  it('a listing with no priced routes is unaffordable and ranks last', () => {
    const noRoutes = listing({ name: 'no-routes', routes: [] });
    const ok = listing({ name: 'ok' });
    const ranked = rankProviders([noRoutes, ok], 0.01);
    expect(ranked[0]!.name).toBe('ok');
    expect(ranked[1]!.name).toBe('no-routes');
    expect(Number.isNaN(ranked[1]!.priceUsdForTask)).toBe(true);
  });

  it('penalises zero-feedback providers relative to an otherwise identical provider with feedback', () => {
    const untested = listing({ name: 'untested', totalFeedback: 0, avgScore: undefined });
    const tested = listing({ name: 'tested', totalFeedback: 5, avgScore: 0 }); // same reputation term (0) as untested's undefined->0
    const ranked = rankProviders([untested, tested], 0.01);
    expect(ranked[0]!.name).toBe('tested');
    expect(ranked[1]!.name).toBe('untested');
    expect(ranked[1]!.rationale).toMatch(/untested/);
  });

  it('is monotonic in reputation: strictly higher avgScore (all else equal) never ranks lower', () => {
    for (let i = 0; i < 20; i++) {
      const lo = Math.floor(Math.random() * 50);
      const hi = lo + 1 + Math.floor(Math.random() * 50);
      const a = listing({ name: 'lo', avgScore: lo });
      const b = listing({ name: 'hi', avgScore: hi });
      const [first] = rankProviders([a, b], 0.02);
      expect(first!.name).toBe('hi');
    }
  });

  it('is monotonic in price: strictly cheaper (all else equal) never ranks lower', () => {
    for (let i = 0; i < 20; i++) {
      const cheapPrice = 0.001 + Math.random() * 0.005;
      const pricyPrice = cheapPrice + 0.001 + Math.random() * 0.005;
      const cheap = listing({ name: 'cheap', routes: [{ method: 'POST', path: '/a', priceUsd: cheapPrice, description: '' }] });
      const pricy = listing({ name: 'pricy', routes: [{ method: 'POST', path: '/a', priceUsd: pricyPrice, description: '' }] });
      const [first] = rankProviders([cheap, pricy], 0.02);
      expect(first!.name).toBe('cheap');
    }
  });

  it('every ranked provider carries a non-empty human-readable rationale', () => {
    const ranked = rankProviders([listing({ name: 'a' }), listing({ name: 'b', avgScore: undefined, totalFeedback: 0 })], 0.02);
    for (const r of ranked) expect(r.rationale.length).toBeGreaterThan(0);
  });

  it('custom weights change the ordering when reputation and affordability disagree', () => {
    const cheapButBad = listing({ name: 'cheapBad', avgScore: 10, routes: [{ method: 'POST', path: '/a', priceUsd: 0.001, description: '' }] });
    const pricyButGood = listing({ name: 'pricyGood', avgScore: 99, routes: [{ method: 'POST', path: '/a', priceUsd: 0.018, description: '' }] });
    const repHeavy = rankProviders([cheapButBad, pricyButGood], 0.02, { ...DEFAULT_WEIGHTS, reputation: 5, affordability: 0.01 });
    expect(repHeavy[0]!.name).toBe('pricyGood');
    const priceHeavy = rankProviders([cheapButBad, pricyButGood], 0.02, { ...DEFAULT_WEIGHTS, reputation: 0.01, affordability: 5 });
    expect(priceHeavy[0]!.name).toBe('cheapBad');
  });
});
