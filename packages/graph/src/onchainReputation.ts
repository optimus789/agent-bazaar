import { createPublicClient, http, parseAbiItem, type PublicClient } from 'viem';
import { baseSepolia, sepolia } from 'viem/chains';
import { ERC8004_REPUTATION_REGISTRY, type Agent0Chain } from '@bazaar/shared';

/**
 * Reputation read straight from the ERC-8004 ReputationRegistry contract,
 * bypassing The Graph entirely.
 *
 * WHY THIS EXISTS: the Agent0 subgraphs are served by The Graph's
 * decentralized network, and a given subgraph may be served by only ONE
 * indexer. On 2026-09-08 the sole base-sepolia indexer
 * (0xbdfb5ee5a2abf4fc7bb1bd1221067aef7f9de491) went offline and the gateway
 * returned `bad indexers: ... Unavailable(no status: indexer not available)`
 * for every query, which blanked reputation and the provider detail pages.
 *
 * The subgraph is only an INDEX of this contract — the contract is the source
 * of truth and stayed available throughout. So when the subgraph is
 * unreachable we can still show real, on-chain reputation rather than a
 * misleading "untested / 0".
 */

const NEW_FEEDBACK = parseAbiItem(
  'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
);

const GET_SUMMARY_ABI = [
  {
    type: 'function',
    name: 'getSummary',
    stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddresses', type: 'address[]' },
      { name: 'tag1', type: 'string' },
      { name: 'tag2', type: 'string' },
    ],
    outputs: [{ type: 'uint64' }, { type: 'int128' }, { type: 'uint8' }],
  },
] as const;

/**
 * Public RPCs cap eth_getLogs at a 10,000-block range (confirmed live on
 * sepolia.base.org: `eth_getLogs is limited to a 10,000 range`), so the scan
 * is chunked. 200k blocks is ~4.6 days at Base Sepolia's 2s blocks, which
 * comfortably covers this project's feedback history; a shorter window
 * silently under-counts (a 60k scan found 3 of agent 9179's 6 entries).
 */
const CHUNK = 9_500n;
const SCAN_BLOCKS = 200_000n;
/** In-flight getLogs cap — see the rate-limit note in the scan below. */
const SCAN_CONCURRENCY = 6;

/**
 * Reputation only changes when a buyer completes a purchase and posts
 * feedback — a handful of times a day at most — but the scan above costs ~22
 * sequential RPC round-trips (~6s measured live). Re-running that on every
 * page render made the marketplace take ~4s to load. Cache per agent and
 * serve the cached value until it expires; a stale-by-minutes score is a far
 * better trade than a multi-second page load, and this path only runs at all
 * when the subgraph is already down.
 */
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: OnchainReputation }>();

export interface OnchainReputation {
  totalFeedback: number;
  /** 0–100 average, undefined when the agent has no feedback at all */
  avgScore?: number;
}

function clientFor(chain: Agent0Chain): PublicClient {
  const viemChain = chain === 'base-sepolia' ? baseSepolia : sepolia;
  return createPublicClient({ chain: viemChain, transport: http() }) as PublicClient;
}

/**
 * `getSummary` reverts with "clientAddresses required" when passed an empty
 * array — it will not aggregate over all clients on its own — so the feedback
 * givers have to be discovered from NewFeedback logs first. The contract then
 * does the aggregation itself, which keeps this consistent with however the
 * registry weights/normalises values rather than re-implementing that here.
 */
export async function readOnchainReputation(chain: Agent0Chain, agentId: string | number): Promise<OnchainReputation> {
  const cacheKey = `${chain}:${agentId}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const client = clientFor(chain);
  const id = BigInt(agentId);
  const latest = await client.getBlockNumber();

  // The chunks are independent, so issue them concurrently rather than in the
  // sequential loop this started as — measured live that loop cost ~5.9s per
  // agent, versus ~310ms fully parallel. Fully parallel is too aggressive
  // though: 22 simultaneous calls repeated across both agents trips
  // sepolia.base.org's `over rate limit` (-32016). Cap the in-flight count so
  // the scan stays fast without getting throttled.
  const floor = latest > SCAN_BLOCKS ? latest - SCAN_BLOCKS : 0n;
  const ranges: { from: bigint; to: bigint }[] = [];
  for (let end = latest; end > floor; end -= CHUNK) {
    ranges.push({ from: end - CHUNK + 1n > floor ? end - CHUNK + 1n : floor, to: end });
  }
  const clients = new Set<string>();
  for (let i = 0; i < ranges.length; i += SCAN_CONCURRENCY) {
    const batches = await Promise.all(
      ranges.slice(i, i + SCAN_CONCURRENCY).map((r) =>
        client.getLogs({ address: ERC8004_REPUTATION_REGISTRY, event: NEW_FEEDBACK, args: { agentId: id }, fromBlock: r.from, toBlock: r.to }),
      ),
    );
    for (const logs of batches) for (const l of logs) if (l.args.clientAddress) clients.add(l.args.clientAddress);
  }
  if (clients.size === 0) return cached(cacheKey, { totalFeedback: 0 });

  const [count, aggregate, decimals] = await client.readContract({
    address: ERC8004_REPUTATION_REGISTRY,
    abi: GET_SUMMARY_ABI,
    functionName: 'getSummary',
    args: [id, [...clients] as `0x${string}`[], '', ''],
  });

  const total = Number(count);
  if (total === 0) return cached(cacheKey, { totalFeedback: 0 });
  return cached(cacheKey, { totalFeedback: total, avgScore: Number(aggregate) / 10 ** Number(decimals) });
}

/** Test seam: drops the memo so cases can exercise a cold read independently. */
export function __clearOnchainReputationCache(): void {
  cache.clear();
}

function cached(key: string, value: OnchainReputation): OnchainReputation {
  cache.set(key, { at: Date.now(), value });
  return value;
}
