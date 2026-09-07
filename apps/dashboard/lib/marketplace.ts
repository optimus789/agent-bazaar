import { fixtureClient, hydrateCatalogs, listAgents, StudioClient, withKnownProvidersFallback } from '@bazaar/graph';
import type { ProviderListing } from '@bazaar/shared';
import { GRAPH_API_KEY, MOCK } from './env.js';

/**
 * Server-only: builds a Graph client from the Studio API key. Never import
 * this module from a client component — the key must not reach the browser.
 * Every listing is hydrated against its own /catalog so the marketplace shows
 * live prices, not just what the Agent0 subgraph's description field encodes.
 */
export async function fetchMarketplace(): Promise<{ listings: ProviderListing[]; mode: 'studio' | 'mock' | 'unconfigured' }> {
  if (MOCK || !GRAPH_API_KEY) {
    const client = fixtureClient();
    const listings = await hydrateCatalogs(await listAgents(client, { x402Only: true }));
    return { listings, mode: MOCK ? 'mock' : 'unconfigured' };
  }
  try {
    const client = new StudioClient(GRAPH_API_KEY);
    // Unfiltered: withKnownProvidersFallback needs our own agents even when
    // their still-uncrawled registrationFile fails the x402Support filter,
    // so their real reputation isn't lost — see packages/graph/src/knownProviders.ts.
    const realListings = await listAgents(client, { x402Only: false });
    const listings = await hydrateCatalogs(withKnownProvidersFallback(realListings));
    return { listings, mode: 'studio' };
  } catch {
    // Discovery failing must not crash the page — fall back to fixtures so the
    // marketplace still renders something explainable.
    const client = fixtureClient();
    const listings = await hydrateCatalogs(await listAgents(client, { x402Only: true }));
    return { listings, mode: 'mock' };
  }
}
