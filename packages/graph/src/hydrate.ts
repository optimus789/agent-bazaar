import type { ProviderListing } from '@bazaar/shared';

/**
 * Fetches each provider's live /catalog so listings carry real priced routes —
 * the Agent0 subgraph only encodes rail + catalog URL in the description (see
 * agent0.ts's parseDescription), not prices. Used by both the buyer agent's
 * discover_providers tool and the dashboard's marketplace page, so a provider
 * that changes its prices is reflected everywhere without a re-registration.
 */
export async function hydrateCatalogs(listings: ProviderListing[], fetchImpl: typeof fetch = fetch): Promise<ProviderListing[]> {
  return Promise.all(
    listings.map(async (l) => {
      if (!l.baseUrl) return l;
      try {
        const res = await fetchImpl(`${l.baseUrl}/catalog`);
        if (!res.ok) return l;
        const body = (await res.json()) as { routes?: ProviderListing['routes'] };
        return body.routes ? { ...l, routes: body.routes } : l;
      } catch {
        return l; // discovery must not fail because one provider is offline
      }
    }),
  );
}
