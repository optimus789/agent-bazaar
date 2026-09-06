import type { ProviderListing, RankedProvider } from '@bazaar/shared';

export interface RankingWeights {
  reputation: number;
  affordability: number;
  validation: number;
  /** flat penalty subtracted when a provider has zero feedback (untested) */
  noFeedbackPenalty: number;
}

export const DEFAULT_WEIGHTS: RankingWeights = {
  reputation: 0.5,
  affordability: 0.3,
  validation: 0.15,
  noFeedbackPenalty: 0.1,
};

/** The cheapest priced route on a listing, or undefined if it has none. */
export function cheapestPriceUsd(listing: ProviderListing): number | undefined {
  if (!listing.routes.length) return undefined;
  return Math.min(...listing.routes.map((r) => r.priceUsd));
}

/**
 * score = w_rep * (avgScore/100) + w_afford * (1 - price/budget) + w_val * min(validations,1)
 *         - (noFeedbackPenalty if totalFeedback === 0)
 *
 * A provider whose cheapest route already exceeds the budget scores -Infinity —
 * it is not affordable at all, regardless of reputation, and rank_providers must
 * put it last (or the caller should drop it before paying).
 */
export function rankProviders(listings: ProviderListing[], budgetUsd: number, weights: RankingWeights = DEFAULT_WEIGHTS): RankedProvider[] {
  const ranked = listings.map((listing) => {
    const price = cheapestPriceUsd(listing);
    const rationale: string[] = [];

    if (price === undefined) {
      rationale.push('no priced routes advertised');
      return { ...listing, score: -Infinity, rationale: rationale.join('; '), priceUsdForTask: NaN };
    }
    if (price > budgetUsd) {
      rationale.push(`cheapest route $${price} exceeds budget $${budgetUsd}`);
      return { ...listing, score: -Infinity, rationale: rationale.join('; '), priceUsdForTask: price };
    }

    const reputationTerm = weights.reputation * ((listing.avgScore ?? 0) / 100);
    rationale.push(listing.avgScore !== undefined ? `reputation ${listing.avgScore.toFixed(0)}/100` : 'no reputation score yet');

    const affordabilityTerm = weights.affordability * (1 - price / budgetUsd);
    rationale.push(`price $${price} is ${((price / budgetUsd) * 100).toFixed(0)}% of budget`);

    const validationTerm = weights.validation * Math.min(listing.validations, 1);
    if (listing.validations > 0) rationale.push(`${listing.validations} validation(s)`);
    else rationale.push('unvalidated');

    let score = reputationTerm + affordabilityTerm + validationTerm;
    if (listing.totalFeedback === 0) {
      score -= weights.noFeedbackPenalty;
      rationale.push('no feedback on record yet — untested');
    }

    return { ...listing, score, rationale: rationale.join('; '), priceUsdForTask: price };
  });

  return ranked.sort((a, b) => b.score - a.score);
}
