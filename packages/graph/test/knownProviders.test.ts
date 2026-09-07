import { describe, expect, it } from 'vitest';
import type { ProviderListing } from '@bazaar/shared';
import { KNOWN_PROVIDERS_FALLBACK, withKnownProvidersFallback } from '../src/knownProviders.js';

function otherListing(id: string, x402Support = true): ProviderListing {
  return {
    id,
    chain: 'base-sepolia',
    agentId: id.split(':')[1]!,
    owner: '0xother',
    name: `Other agent ${id}`,
    description: null,
    rail: undefined,
    baseUrl: undefined,
    routes: [],
    x402Support,
    totalFeedback: 0,
    validations: 0,
  };
}

describe('withKnownProvidersFallback', () => {
  it('puts our own providers first even when the subgraph result buries them among many others', () => {
    const realListings = [otherListing('84532:1'), otherListing('84532:2'), ...KNOWN_PROVIDERS_FALLBACK, otherListing('84532:3')];
    const merged = withKnownProvidersFallback(realListings);
    expect(merged.slice(0, 2).map((l) => l.id)).toEqual(KNOWN_PROVIDERS_FALLBACK.map((l) => l.id));
    expect(merged).toHaveLength(realListings.length);
  });

  it('adds the fallback entries first when our providers are missing entirely from the subgraph result', () => {
    const realListings = [otherListing('84532:1')];
    const merged = withKnownProvidersFallback(realListings);
    expect(merged.slice(0, 2).map((l) => l.id)).toEqual(KNOWN_PROVIDERS_FALLBACK.map((l) => l.id));
    expect(merged.at(-1)?.id).toBe('84532:1');
  });

  it('prefers the real listing data over the fallback when our providers are present, but still sorts them first', () => {
    const ourRealListing = { ...KNOWN_PROVIDERS_FALLBACK[0]!, totalFeedback: 5 };
    const realListings = [otherListing('84532:1'), ourRealListing];
    const merged = withKnownProvidersFallback(realListings);
    expect(merged[0]).toBe(ourRealListing);
  });

  it('keeps real avgScore/totalFeedback for our own provider even when its registrationFile crawl is still stuck (x402Support false)', () => {
    const ourRealListingUncrawled: ProviderListing = {
      ...KNOWN_PROVIDERS_FALLBACK[1]!,
      x402Support: false,
      rail: undefined,
      baseUrl: undefined,
      avgScore: 90,
      totalFeedback: 1,
    };
    const realListings = [otherListing('84532:1'), ourRealListingUncrawled];
    const merged = withKnownProvidersFallback(realListings);
    const ours = merged.find((l) => l.id === KNOWN_PROVIDERS_FALLBACK[1]!.id);
    expect(ours).toMatchObject({
      id: KNOWN_PROVIDERS_FALLBACK[1]!.id,
      rail: KNOWN_PROVIDERS_FALLBACK[1]!.rail,
      baseUrl: KNOWN_PROVIDERS_FALLBACK[1]!.baseUrl,
      avgScore: 90,
      totalFeedback: 1,
    });
  });

  it('drops other agents whose registrationFile crawl has not resolved (x402Support false)', () => {
    const realListings = [otherListing('84532:1', false), otherListing('84532:2', true)];
    const merged = withKnownProvidersFallback(realListings);
    expect(merged.map((l) => l.id)).not.toContain('84532:1');
    expect(merged.map((l) => l.id)).toContain('84532:2');
  });
});
