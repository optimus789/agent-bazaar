import type { ProviderListing } from '@bazaar/shared';

/**
 * TEMPORARY FALLBACK (added 2026-09-06, still needed 2026-09-07): Agent0's
 * registrationFile crawl has not completed for our two real, on-chain
 * registered agents — confirmed empty well over 12 hours after registration,
 * after a setAgentURI() re-trigger (a real on-chain call), and after fixing
 * a real 404 in the tokenURI the crawler would have hit. This is stuck on
 * The Graph's indexing side, not a discovery bug in this repo: `listAgents`
 * correctly finds both agentIds on-chain, but the off-chain crawl that would
 * populate `registrationFile` (rail, baseUrl, x402Support) never completes.
 *
 * Shared between the buyer agent's `discover_providers` tool and the
 * dashboard's marketplace page so both fall back to the exact same data our
 * own registration files already advertise on-chain, rather than duplicating
 * it. Remove once `registrationFile` resolves via a real subgraph query —
 * see docs/STATUS.md WP06/WP07 for tracking.
 */
export const KNOWN_PROVIDERS_FALLBACK: ProviderListing[] = [
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

/** Merge real subgraph listings with the fallback, real listings always winning by id. */
export function withKnownProvidersFallback(realListings: ProviderListing[]): ProviderListing[] {
  const knownIds = new Set(realListings.map((l) => l.id));
  const missing = KNOWN_PROVIDERS_FALLBACK.filter((l) => !knownIds.has(l.id));
  return [...realListings, ...missing];
}
