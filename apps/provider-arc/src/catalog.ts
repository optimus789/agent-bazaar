import { usdPrice, type CatalogRoute, type UsdPrice } from '@bazaar/shared';

export const PRICES = {
  summarise: 0.001,
  classifyRisk: 0.0005,
} as const;

export const CATALOG: CatalogRoute[] = [
  {
    method: 'POST',
    path: '/v1/task/summarise',
    priceUsd: PRICES.summarise,
    description: 'Summarise arbitrary text. Paid in USDC via Circle Gateway nanopayments on Arc.',
    inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
  },
  {
    method: 'POST',
    path: '/v1/task/classify-risk',
    priceUsd: PRICES.classifyRisk,
    description: 'Classify a risk brief (e.g. from the Hedera provider) into a label with confidence and rationale.',
    inputSchema: { type: 'object', required: ['brief'], properties: { brief: { type: 'object' } } },
  },
];

export function catalogPriceString(route: CatalogRoute): UsdPrice {
  return usdPrice(route.priceUsd);
}

export function findRoute(method: string, path: string): CatalogRoute | undefined {
  return CATALOG.find((r) => r.method === method && r.path === path);
}
