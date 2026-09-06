import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createPublicClient, createWalletClient, decodeEventLog, getContract, http, publicActions, type Address, type Chain, type Hash, type Hex, type Transport } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ERC8004_IDENTITY_REGISTRY, explorerTxUrl, type ChainKey } from '@bazaar/shared';
import identityRegistryAbi from './identityRegistryAbi.json' with { type: 'json' };

export interface RegisteredIdentity {
  chain: ChainKey;
  chainId: number;
  agentId: string;
  owner: Address;
  tokenUri: string;
  txHash: Hash;
  registeredAt: string;
}

type IdentityStore = Record<string, RegisteredIdentity>; // key: `${chainKey}:${name}`

const DEFAULT_STORE_PATH = resolve(process.cwd(), '../../data/identity.json');

async function loadStore(path = DEFAULT_STORE_PATH): Promise<IdentityStore> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as IdentityStore;
  } catch {
    return {};
  }
}

async function saveStore(store: IdentityStore, path = DEFAULT_STORE_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2));
}

export interface RegisterAgentOptions {
  name: string;
  chain: Chain;
  chainKey: ChainKey;
  privateKey: Hex;
  tokenUri: string;
  registryAddress?: Address;
  storePath?: string;
  /** manual gas limit; Hedera's Hashio JSON-RPC gas estimation can be unreliable (see WP04 gotchas) */
  gas?: bigint;
  /** override the transport (tests inject a mock `custom()` transport here instead of `http()`) */
  transport?: Transport;
}

/**
 * Register (or return the existing registration for) a named agent on one chain.
 * Idempotent via a local JSON store — the same {chainKey, name} pair is never
 * registered twice, per the WP04 gotcha about double-registration.
 */
export async function registerAgent(opts: RegisterAgentOptions): Promise<RegisteredIdentity> {
  const store = await loadStore(opts.storePath);
  const key = `${opts.chainKey}:${opts.name}`;
  const existing = store[key];
  if (existing) return existing;

  const account = privateKeyToAccount(opts.privateKey);
  const transport: Transport = opts.transport ?? http();
  const wallet = createWalletClient({ account, chain: opts.chain, transport }).extend(publicActions);
  const registry = opts.registryAddress ?? ERC8004_IDENTITY_REGISTRY;

  const txHash = await wallet.writeContract({
    address: registry,
    abi: identityRegistryAbi,
    functionName: 'register',
    args: [opts.tokenUri],
    gas: opts.gas,
  });
  const receipt = await wallet.waitForTransactionReceipt({ hash: txHash });

  // Decode the Registered(agentId, agentURI, owner) event directly from the receipt logs.
  let agentId: string | undefined;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== registry.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: identityRegistryAbi, data: log.data, topics: log.topics, eventName: 'Registered' });
      const args = decoded.args as unknown as { agentId: bigint; owner: string; agentURI: string };
      agentId = args.agentId.toString();
      break;
    } catch {
      continue;
    }
  }
  if (!agentId) throw new Error(`could not find Registered event in receipt ${txHash} on ${opts.chainKey}`);

  const identity: RegisteredIdentity = {
    chain: opts.chainKey,
    chainId: opts.chain.id,
    agentId,
    owner: account.address,
    tokenUri: opts.tokenUri,
    txHash,
    registeredAt: new Date().toISOString(),
  };
  store[key] = identity;
  await saveStore(store, opts.storePath);
  console.log(`registered ${opts.name} on ${opts.chainKey}: agentId=${agentId} tx=${explorerTxUrl(opts.chainKey, txHash)}`);
  return identity;
}

export async function readIdentity(chainKey: ChainKey, name: string, storePath = DEFAULT_STORE_PATH): Promise<RegisteredIdentity | undefined> {
  const store = await loadStore(storePath);
  return store[`${chainKey}:${name}`];
}

export function readContractClient(chain: Chain, registryAddress: Address = ERC8004_IDENTITY_REGISTRY) {
  const client = createPublicClient({ chain, transport: http() });
  return getContract({ address: registryAddress, abi: identityRegistryAbi, client });
}
