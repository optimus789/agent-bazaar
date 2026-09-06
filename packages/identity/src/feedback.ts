import { createHash } from 'node:crypto';
import { createWalletClient, http, publicActions, type Address, type Chain, type Hash, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ERC8004_REPUTATION_REGISTRY } from '@bazaar/shared';
import reputationRegistryAbi from './reputationRegistryAbi.json' with { type: 'json' };

export interface GiveFeedbackOptions {
  chain: Chain;
  privateKey: Hex;
  agentId: bigint | number | string;
  /** 0–100 score; stored on-chain as value=score, valueDecimals=0 (see readAllFeedback normalisation in @bazaar/graph) */
  score0to100: number;
  tag1: string;
  tag2?: string;
  /** the route/endpoint this feedback is about, e.g. "POST /v1/usdc/brief/pool" */
  endpoint?: string;
  /** off-chain URI with a longer written review; optional */
  feedbackUri?: string;
  registryAddress?: Address;
}

/**
 * Post feedback to the ERC-8004 ReputationRegistry.
 *
 * Exact signature confirmed from github.com/erc-8004/erc-8004-contracts
 * abis/ReputationRegistry.json on 2026-09-06 — note it takes an `endpoint`
 * argument between tag2 and feedbackURI that easy paraphrases of the spec omit:
 *   giveFeedback(agentId, value int128, valueDecimals uint8, tag1, tag2, endpoint, feedbackURI, feedbackHash bytes32)
 *
 * Self-feedback (buyer key === agent owner key) is rejected by the contract.
 */
export async function giveFeedback(opts: GiveFeedbackOptions): Promise<{ txHash: Hash }> {
  if (!Number.isFinite(opts.score0to100) || opts.score0to100 < 0 || opts.score0to100 > 100) {
    throw new Error(`score0to100 must be 0–100, got ${opts.score0to100}`);
  }
  const account = privateKeyToAccount(opts.privateKey);
  const client = createWalletClient({ account, chain: opts.chain, transport: http() }).extend(publicActions);
  const registry = opts.registryAddress ?? ERC8004_REPUTATION_REGISTRY;

  const feedbackUri = opts.feedbackUri ?? '';
  const feedbackHash = feedbackUri
    ? (`0x${createHash('sha256').update(feedbackUri).digest('hex')}` as Hex)
    : (`0x${'0'.repeat(64)}` as Hex);

  const txHash = await client.writeContract({
    address: registry,
    abi: reputationRegistryAbi,
    functionName: 'giveFeedback',
    args: [BigInt(opts.agentId), BigInt(Math.round(opts.score0to100)), 0, opts.tag1, opts.tag2 ?? '', opts.endpoint ?? '', feedbackUri, feedbackHash],
  });
  await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}
