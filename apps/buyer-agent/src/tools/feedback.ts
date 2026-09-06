import { tool } from 'ai';
import { z } from 'zod';
import { baseSepolia, sepolia } from 'viem/chains';
import { giveFeedback } from '@bazaar/identity';
import { HEDERA_TESTNET } from '@bazaar/shared';

function chainFor(key: 'base-sepolia' | 'eth-sepolia' | 'hedera-testnet') {
  switch (key) {
    case 'base-sepolia':
      return baseSepolia;
    case 'eth-sepolia':
      return sepolia;
    case 'hedera-testnet':
      return HEDERA_TESTNET;
  }
}

export function makeFeedbackTool(buyerPrivateKey: `0x${string}`) {
  return tool({
    description:
      'Post feedback to the ERC-8004 Reputation Registry for a provider the agent just paid. Use tag1 "purchase" for a normal completed purchase or "failed" when the provider did not deliver after payment.',
    inputSchema: z.object({
      chain: z.enum(['base-sepolia', 'eth-sepolia', 'hedera-testnet']),
      agentId: z.string(),
      score0to100: z.number().min(0).max(100),
      tag1: z.enum(['purchase', 'failed']).default('purchase'),
      endpoint: z.string().optional().describe('the route this feedback is about, e.g. "POST /v1/usdc/brief/pool"'),
    }),
    execute: async ({ chain, agentId, score0to100, tag1, endpoint }) => {
      const { txHash } = await giveFeedback({ chain: chainFor(chain), privateKey: buyerPrivateKey, agentId, score0to100, tag1, endpoint });
      return { txHash };
    },
  });
}
