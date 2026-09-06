import { tool } from 'ai';
import { z } from 'zod';
import type { ProviderListing } from '@bazaar/shared';
import { rankProviders } from '../ranking.js';

const ListingSchema = z.object({
  id: z.string(),
  chain: z.string(),
  agentId: z.string(),
  owner: z.string(),
  name: z.string(),
  description: z.string(),
  rail: z.enum(['hedera', 'arc', 'graph']),
  baseUrl: z.string(),
  routes: z.array(z.object({ method: z.enum(['GET', 'POST']), path: z.string(), priceUsd: z.number(), description: z.string() })),
  x402Support: z.boolean(),
  totalFeedback: z.number(),
  avgScore: z.number().optional(),
  validations: z.number(),
});

export const rankTool = tool({
  description:
    'Rank discovered providers by reputation, affordability against the given budget, and validation count. Returns each with a numeric score and a human-readable rationale. Providers whose cheapest route exceeds the budget are ranked last and must not be paid.',
  inputSchema: z.object({
    listings: z.array(ListingSchema).describe('providers returned by discover_providers'),
    budgetUsd: z.number().positive(),
  }),
  execute: async ({ listings, budgetUsd }) => {
    const ranked = rankProviders(listings as ProviderListing[], budgetUsd);
    return { ranked };
  },
});
