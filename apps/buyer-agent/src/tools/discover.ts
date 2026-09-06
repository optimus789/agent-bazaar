import { tool } from 'ai';
import { z } from 'zod';
import { hydrateCatalogs, listAgents, withKnownProvidersFallback, type GraphClient } from '@bazaar/graph';

export function makeDiscoverTool(graph: GraphClient, fetchImpl: typeof fetch = fetch) {
  return tool({
    description:
      'Discover Bazaar providers via The Graph Agent0 (ERC-8004) subgraphs on Base Sepolia and Ethereum Sepolia — one query, both chains. Returns each provider with its rail, reputation, validations, and live priced routes.',
    inputSchema: z.object({
      capability: z.string().optional().describe('optional free-text filter, e.g. "risk brief" or "summarise" — matched against provider name/description'),
    }),
    execute: async ({ capability }) => {
      const realListings = await listAgents(graph, { x402Only: true });
      const listings = withKnownProvidersFallback(realListings);
      const hydrated = await hydrateCatalogs(listings, fetchImpl);
      // Only surface providers this agent can actually transact with — an
      // agent that returned no routes (offline, or not one of ours) is dead
      // weight in the model's context on every subsequent step of the run.
      const withRoutes = hydrated.filter((l) => l.routes.length > 0);
      const filtered = capability
        ? withRoutes.filter((l) => `${l.name} ${l.description}`.toLowerCase().includes(capability.toLowerCase()))
        : withRoutes;
      return { providers: filtered, count: filtered.length };
    },
  });
}
