export * from './client.js';
export * from './agent0.js';
export * from './messari.js';
export * from './fixtures.js';
export * from './hydrate.js';
export * from './knownProviders.js';
export * from './hederaMirror.js';
export * from './onchainReputation.js';
export { AGENTS_QUERY, AGENT_QUERY } from './queries/agents.js';
export { TOP_POOLS_QUERY, POOL_SNAPSHOTS_QUERY } from './queries/messari.js';

import { loadEnv, requireEnv } from '@bazaar/shared';
import { fixtureClient } from './fixtures.js';
import { StudioClient, X402GraphClient, type GraphClient } from './client.js';

/** Pick a client from the environment: MOCK → fixtures; GRAPH_API_KEY → Studio; else x402 with the buyer key. */
export function graphClientFromEnv(env = loadEnv()): GraphClient {
  if (env.MOCK) return fixtureClient();
  if (env.GRAPH_API_KEY) return new StudioClient(env.GRAPH_API_KEY);
  requireEnv(env, 'EVM_BUYER_PRIVATE_KEY');
  return new X402GraphClient({ privateKey: env.EVM_BUYER_PRIVATE_KEY as `0x${string}`, env: env.X402_ENV });
}
