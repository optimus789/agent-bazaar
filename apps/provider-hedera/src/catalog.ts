import { hbarPrice, usdPrice, type CatalogRoute, type UsdPrice } from '@bazaar/shared';

/**
 * Every paid route this provider sells. The same list feeds the x402 middleware,
 * GET /catalog, and the ERC-8004 registration file (WP04).
 */
export const PRICES = {
  poolBrief: 0.002,
  poolBriefDeep: 0.01,
  tokenBrief: 0.002,
  agentLookup: 0.0005,
} as const;

/** HBAR equivalents used on the /hbar routes; roughly $0.10/HBAR at time of writing. */
export const HBAR_PRICES = {
  poolBrief: 0.02,
  poolBriefDeep: 0.1,
} as const;

export const CATALOG: CatalogRoute[] = [
  {
    method: 'POST',
    path: '/v1/usdc/brief/pool',
    priceUsd: PRICES.poolBrief,
    description: 'Risk/opportunity brief for a DEX pool (Messari standardized data + reasoning). Paid in USDC on Hedera.',
    inputSchema: { type: 'object', required: ['poolId'], properties: { chain: { type: 'string', default: 'base' }, poolId: { type: 'string' } } },
  },
  {
    method: 'POST',
    path: '/v1/hbar/brief/pool',
    priceUsd: PRICES.poolBrief,
    altPrice: hbarPrice(HBAR_PRICES.poolBrief),
    description: 'Same brief, paid in HBAR.',
    inputSchema: { type: 'object', required: ['poolId'], properties: { chain: { type: 'string', default: 'base' }, poolId: { type: 'string' } } },
  },
  {
    method: 'POST',
    path: '/v1/usdc/brief/pool/deep',
    priceUsd: PRICES.poolBriefDeep,
    description: 'Deep brief over 30 daily snapshots (metered tier).',
    inputSchema: { type: 'object', required: ['poolId'], properties: { chain: { type: 'string', default: 'base' }, poolId: { type: 'string' } } },
  },
  {
    method: 'POST',
    path: '/v1/usdc/lookup/agent',
    priceUsd: PRICES.agentLookup,
    description: 'Reputation summary of an ERC-8004 agent from the Agent0 subgraphs.',
    inputSchema: { type: 'object', required: ['chain', 'agentId'], properties: { chain: { type: 'string', enum: ['base-sepolia', 'eth-sepolia'] }, agentId: { type: 'string' } } },
  },
];

export function catalogPriceString(route: CatalogRoute): UsdPrice {
  return usdPrice(route.priceUsd);
}

export function findRoute(method: string, path: string): CatalogRoute | undefined {
  return CATALOG.find((r) => r.method === method && r.path === path);
}
