import { describe, expect, it } from 'vitest';
import type { ProviderListing } from '@bazaar/shared';
import { KNOWN_PROVIDERS_FALLBACK, withKnownProvidersFallback } from '../src/knownProviders.js';

function otherListing(id: string): ProviderListing {
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
    x402Support: false,
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
});
