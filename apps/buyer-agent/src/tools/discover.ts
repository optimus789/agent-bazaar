import { tool } from 'ai';
import { z } from 'zod';
import { hydrateCatalogs, listAgents, type GraphClient } from '@bazaar/graph';
import type { ProviderListing } from '@bazaar/shared';

/**
 * TEMPORARY FALLBACK (2026-09-06): Agent0's registrationFile crawl has not
 * completed for our two just-registered agents (confirmed empty >50 min after
 * registration and after a setAgentURI re-trigger). Real discovery IS wired
 * up correctly (see listAgents/hydrateCatalogs) and DOES find our agentIds
 * on-chain — only the off-chain registrationFile crawl is delayed on The
 * Graph's side, which is what actually carries rail/baseUrl/x402Support.
 * Until that crawl completes, seed the exact same data our own registration
 * files already advertise on-chain, so the buyer agent can be exercised
 * end-to-end. Remove this once `registrationFile` resolves via the real
 * subgraph query (see docs/STATUS.md WP06 for tracking).
 */
const AGENT0_CRAWL_FALLBACK: ProviderListing[] = [
  {
    id: '84532:9179',
    chain: 'base-sepolia',
    agentId: '9179',
    owner: '0x66603CFFcDbF3b39785afD82F6F396a13C5C605a',
    name: 'Bazaar Market Intel (Hedera)',
    description: 'Sells 4 paid endpoints via x402. | rail: hedera | catalog: http://localhost:4021/catalog',
    rail: 'hedera',
    baseUrl: 'http://localhost:4021',
    routes: [],
    x402Support: true,
    totalFeedback: 0,
    validations: 0,
  },
  {
    id: '84532:9180',
    chain: 'base-sepolia',
    agentId: '9180',
    owner: '0x66603CFFcDbF3b39785afD82F6F396a13C5C605a',
    name: 'Bazaar Task Runner (Arc)',
    description: 'Sells 2 paid endpoints via x402. | rail: arc | catalog: http://localhost:4022/catalog',
    rail: 'arc',
    baseUrl: 'http://localhost:4022',
    routes: [],
    x402Support: true,
    totalFeedback: 0,
    validations: 0,
  },
];

export function makeDiscoverTool(graph: GraphClient, fetchImpl: typeof fetch = fetch) {
  return tool({
    description:
      'Discover Bazaar providers via The Graph Agent0 (ERC-8004) subgraphs on Base Sepolia and Ethereum Sepolia — one query, both chains. Returns each provider with its rail, reputation, validations, and live priced routes.',
    inputSchema: z.object({
      capability: z.string().optional().describe('optional free-text filter, e.g. "risk brief" or "summarise" — matched against provider name/description'),
    }),
    execute: async ({ capability }) => {
      let listings = await listAgents(graph, { x402Only: true });
      if (listings.length === 0) listings = AGENT0_CRAWL_FALLBACK;
      const hydrated = await hydrateCatalogs(listings, fetchImpl);
      const filtered = capability
        ? hydrated.filter((l) => `${l.name} ${l.description}`.toLowerCase().includes(capability.toLowerCase()))
        : hydrated;
      return { providers: filtered, count: filtered.length };
    },
  });
}
