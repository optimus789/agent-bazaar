import type { ProviderListing } from '@bazaar/shared';

/**
 * TEMPORARY FALLBACK (added 2026-09-06, still needed 2026-09-07): Agent0's
 * registrationFile crawl has not completed for our two real, on-chain
 * registered agents — confirmed empty well over 24 hours after registration,
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
 *
 * `baseUrl` respects `PROVIDER_HEDERA_URL`/`PROVIDER_ARC_URL` when set (same
 * env vars the dashboard already uses — see apps/dashboard/lib/env.ts),
 * falling back to localhost for local dev. Without this, a `--live` buyer-
 * agent run always targeted `localhost:4021`/`4022` regardless of what was
 * in `.env`, so it could never reach the real deployed providers even when
 * the user had correctly set the Railway URLs for the dashboard's own use.
 */
export const KNOWN_PROVIDERS_FALLBACK: ProviderListing[] = [
  {
    id: '84532:9179',
    chain: 'base-sepolia',
    agentId: '9179',
    owner: '0x66603CFFcDbF3b39785afD82F6F396a13C5C605a',
    name: 'Bazaar Market Intel (Hedera)',
    description: `Sells 4 paid endpoints via x402. | rail: hedera | catalog: ${process.env.PROVIDER_HEDERA_URL ?? 'http://localhost:4021'}/catalog`,
    rail: 'hedera',
    baseUrl: process.env.PROVIDER_HEDERA_URL ?? 'http://localhost:4021',
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
    description: `Sells 2 paid endpoints via x402. | rail: arc | catalog: ${process.env.PROVIDER_ARC_URL ?? 'http://localhost:4022'}/catalog`,
    rail: 'arc',
    baseUrl: process.env.PROVIDER_ARC_URL ?? 'http://localhost:4022',
    routes: [],
    x402Support: true,
    totalFeedback: 0,
    validations: 0,
  },
];

/**
 * Merge real subgraph listings with the fallback, real listings always winning
 * by id. Our own providers are surfaced first (dashboard's marketplace table
 * is otherwise ordered however the subgraph query returns it, burying the
 * two providers this whole demo actually uses among 16+ unrelated agents).
 *
 * `realListings` must be UNFILTERED (not run through listAgents' x402Only
 * filter) — our own agents' registrationFile crawl is still stuck (see above),
 * so they fail x402Support and would otherwise never reach `ours` here even
 * though their avgScore/totalFeedback are real, live subgraph data (from
 * ERC-8004 feedback, indexed independent of registrationFile). Losing that
 * silently regressed reputation to "untested" after a real, verified
 * on-chain giveFeedback call — see docs/STATUS.md WP14.
 */
export function withKnownProvidersFallback(realListings: ProviderListing[]): ProviderListing[] {
  const knownIds = new Set(KNOWN_PROVIDERS_FALLBACK.map((l) => l.id));
  const ours = realListings
    .filter((l) => knownIds.has(l.id))
    .map((l) => {
      const fallback = KNOWN_PROVIDERS_FALLBACK.find((f) => f.id === l.id)!;
      return l.x402Support ? l : { ...fallback, avgScore: l.avgScore, totalFeedback: l.totalFeedback };
    });
  const missing = KNOWN_PROVIDERS_FALLBACK.filter((l) => !ours.some((r) => r.id === l.id));
  const others = realListings.filter((l) => !knownIds.has(l.id) && l.x402Support);
  return [...ours, ...missing, ...others];
}

/** Single-listing counterpart to withKnownProvidersFallback, for pages that fetch one agent by id. */
export function knownProviderFallback(id: string): ProviderListing | undefined {
  return KNOWN_PROVIDERS_FALLBACK.find((l) => l.id === id);
}
