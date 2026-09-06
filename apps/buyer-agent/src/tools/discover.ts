import { tool } from 'ai';
import { z } from 'zod';
import { hydrateCatalogs, listAgents, type GraphClient } from '@bazaar/graph';

export function makeDiscoverTool(graph: GraphClient, fetchImpl: typeof fetch = fetch) {
  return tool({
    description:
      'Discover Bazaar providers via The Graph Agent0 (ERC-8004) subgraphs on Base Sepolia and Ethereum Sepolia — one query, both chains. Returns each provider with its rail, reputation, validations, and live priced routes.',
    inputSchema: z.object({
      capability: z.string().optional().describe('optional free-text filter, e.g. "risk brief" or "summarise" — matched against provider name/description'),
    }),
    execute: async ({ capability }) => {
      const listings = await listAgents(graph, { x402Only: true });
      const hydrated = await hydrateCatalogs(listings, fetchImpl);
      const filtered = capability
        ? hydrated.filter((l) => `${l.name} ${l.description}`.toLowerCase().includes(capability.toLowerCase()))
        : hydrated;
      return { providers: filtered, count: filtered.length };
    },
  });
}
