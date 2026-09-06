/** The Graph endpoints and subgraph ids used across the repo. */

export const AGENT0_SUBGRAPHS = {
  'base-sepolia': '4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u',
  'eth-sepolia': '6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT',
} as const;

export type Agent0Chain = keyof typeof AGENT0_SUBGRAPHS;

export const GRAPH_STUDIO_GATEWAY = 'https://gateway.thegraph.com/api';
export const GRAPH_X402_GATEWAY = {
  testnet: { base: 'https://testnet.gateway.thegraph.com/api/x402', chain: 'base-sepolia' as const },
  production: { base: 'https://gateway.thegraph.com/api/x402', chain: 'base' as const },
} as const;

export type X402Env = keyof typeof GRAPH_X402_GATEWAY;

/** Nominal price per paid query on the production x402 gateway (USDC). */
export const GRAPH_X402_PRICE_USD = 0.01;

export const SUBGRAPH_MCP_URL = 'https://subgraphs.mcp.thegraph.com/sse';

export function agent0SubgraphId(chain: Agent0Chain): string {
  return AGENT0_SUBGRAPHS[chain];
}

/** Studio-keyed endpoint: send `Authorization: Bearer <key>`. */
export function studioUrl(subgraphId: string): string {
  return `${GRAPH_STUDIO_GATEWAY}/subgraphs/id/${subgraphId}`;
}

/** x402 endpoint: no key; the client pays per query on the env's chain. */
export function x402Url(subgraphId: string, env: X402Env = 'testnet'): string {
  return `${GRAPH_X402_GATEWAY[env].base}/subgraphs/id/${subgraphId}`;
}

export function x402PaymentChain(env: X402Env = 'testnet'): 'base' | 'base-sepolia' {
  return GRAPH_X402_GATEWAY[env].chain;
}
