import { fixtureClient, hydrateCatalogs, listAgents, readOnchainReputation, StudioClient, withKnownProvidersFallback } from '@bazaar/graph';
import type { Agent0Chain, ProviderListing } from '@bazaar/shared';
import { GRAPH_API_KEY, MOCK } from './env.js';

/** The two providers this project runs; only these get the on-chain repair below. */
const OUR_AGENT_IDS = new Set(['84532:9179', '84532:9180']);

/**
 * Repairs reputation for our own listings by reading the ERC-8004
 * ReputationRegistry directly.
 *
 * The Agent0 subgraph is only an index of that contract, and it can go dark
 * independently of the chain: on 2026-09-08 the sole base-sepolia indexer went
 * offline and every query returned `bad indexers: ... Unavailable`. Without
 * this, `withKnownProvidersFallback` substitutes static zero-feedback entries
 * and the marketplace renders "untested / 0" — which reads as "this agent has
 * no reputation" when the truth is "reputation is temporarily unreadable".
 * That distinction matters, so prefer the slower on-chain read over a
 * misleading zero.
 *
 * Only applied to listings that actually lost their reputation, and only to
 * our own agents: an on-chain read is several RPC round-trips per agent, far
 * too slow to run across all ~16 discovered listings on every page render.
 */
async function repairReputationFromChain(listings: ProviderListing[]): Promise<ProviderListing[]> {
  return Promise.all(
    listings.map(async (l) => {
      if (!OUR_AGENT_IDS.has(l.id) || l.totalFeedback > 0) return l;
      try {
        const onchain = await readOnchainReputation(l.chain as Agent0Chain, l.agentId);
        if (onchain.totalFeedback === 0) return l;
        return { ...l, totalFeedback: onchain.totalFeedback, avgScore: onchain.avgScore };
      } catch (err) {
        console.error('[marketplace] on-chain reputation read failed', l.id, err instanceof Error ? err.message : err);
        return l;
      }
    }),
  );
}

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
    return { listings: await repairReputationFromChain(listings), mode: 'studio' };
  } catch {
    // Discovery failing must not crash the page — fall back to fixtures so the
    // marketplace still renders something explainable. Our own two providers
    // are static entries here, so their reputation still comes from chain.
    const client = fixtureClient();
    const listings = await hydrateCatalogs(await listAgents(client, { x402Only: true }));
    return { listings: await repairReputationFromChain(listings), mode: 'mock' };
  }
}
