import { describe, expect, it } from 'vitest';
import { agent0SubgraphId, studioUrl, x402PaymentChain, x402Url } from '../src/graph.js';

describe('graph url builders', () => {
  it('builds Studio and x402 endpoints for the same subgraph', () => {
    const id = agent0SubgraphId('base-sepolia');
    expect(studioUrl(id)).toBe(`https://gateway.thegraph.com/api/subgraphs/id/${id}`);
    expect(x402Url(id)).toBe(`https://gateway.thegraph.com/api/x402/subgraphs/id/${id}`);
    expect(x402Url(id, 'production')).toBe(`https://gateway.thegraph.com/api/x402/subgraphs/id/${id}`);
  });
  it('maps env to the payment chain', () => {
    expect(x402PaymentChain('testnet')).toBe('base-sepolia');
    expect(x402PaymentChain('production')).toBe('base');
  });
  it('has distinct Agent0 ids per chain', () => {
    expect(agent0SubgraphId('base-sepolia')).not.toBe(agent0SubgraphId('eth-sepolia'));
  });
});
