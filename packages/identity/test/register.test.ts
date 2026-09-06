import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { custom, decodeEventLog, encodeAbiParameters, encodeEventTopics, toHex, type Address, type Hex, type Log } from 'viem';
import { baseSepolia } from 'viem/chains';
import { registerAgent } from '../src/register.js';
import identityRegistryAbi from '../src/identityRegistryAbi.json' with { type: 'json' };

const REGISTRY: Address = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const OWNER: Address = '0x1111111111111111111111111111111111111111';
const PK: Hex = `0x${'11'.repeat(32)}`;
const TX_HASH: Hex = `0x${'aa'.repeat(32)}`;

/** Encode a Registered(uint256 indexed agentId, string agentURI, address indexed owner) log. */
function registeredLog(agentId: bigint, agentURI: string) {
  const topics = encodeEventTopics({ abi: identityRegistryAbi, eventName: 'Registered', args: { agentId, owner: OWNER } });
  const data = encodeAbiParameters([{ type: 'string' }], [agentURI]);
  return {
    address: REGISTRY,
    topics,
    data,
    blockNumber: '0x1',
    blockHash: TX_HASH,
    transactionHash: TX_HASH,
    transactionIndex: '0x0',
    logIndex: '0x0',
    removed: false,
  };
}

/** A viem `custom` transport answering just the RPC calls a write + receipt wait needs. */
function mockTransport(agentId: bigint) {
  return custom({
    async request({ method }: { method: string }) {
      switch (method) {
        case 'eth_chainId':
          return toHex(baseSepolia.id);
        case 'eth_gasPrice':
        case 'eth_maxPriorityFeePerGas':
          return '0x3b9aca00';
        case 'eth_getTransactionCount':
          return '0x0';
        case 'eth_estimateGas':
          return '0x186a0';
        case 'eth_getBlockByNumber':
          return { baseFeePerGas: '0x3b9aca00', gasLimit: '0x1c9c380', number: '0x1', hash: TX_HASH, timestamp: '0x1' };
        case 'eth_sendRawTransaction':
          return TX_HASH;
        case 'eth_getTransactionReceipt':
          return {
            transactionHash: TX_HASH,
            blockHash: TX_HASH,
            blockNumber: '0x1',
            transactionIndex: '0x0',
            from: OWNER,
            to: REGISTRY,
            status: '0x1',
            gasUsed: '0x186a0',
            effectiveGasPrice: '0x3b9aca00',
            cumulativeGasUsed: '0x186a0',
            contractAddress: null,
            logs: [registeredLog(agentId, `ipfs://fixture/${agentId}`)],
            logsBloom: `0x${'0'.repeat(512)}`,
            type: '0x2',
          };
        default:
          throw new Error(`mockTransport: unhandled method ${method}`);
      }
    },
  });
}

describe('registerAgent', () => {
  let storeDir: string;
  let storePath: string;

  beforeEach(async () => {
    storeDir = await mkdtemp(join(tmpdir(), 'bazaar-identity-'));
    storePath = join(storeDir, 'identity.json');
  });
  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true });
  });

  it('registers on-chain, decodes the agentId from the Registered event, and persists it', async () => {
    const identity = await registerAgent({
      name: 'provider-hedera',
      chain: baseSepolia,
      chainKey: 'base-sepolia',
      privateKey: PK,
      tokenUri: 'ipfs://fixture/101',
      registryAddress: REGISTRY,
      storePath,
      gas: 300_000n,
      transport: mockTransport(101n),
    });
    expect(identity.agentId).toBe('101');
    expect(identity.chainId).toBe(baseSepolia.id);
    expect(identity.tokenUri).toBe('ipfs://fixture/101');
    expect(identity.txHash).toBe(TX_HASH);
  });

  it('is idempotent: a second call with a different tokenUri returns the first registration untouched', async () => {
    const first = await registerAgent({
      name: 'provider-hedera',
      chain: baseSepolia,
      chainKey: 'base-sepolia',
      privateKey: PK,
      tokenUri: 'ipfs://fixture/101',
      registryAddress: REGISTRY,
      storePath,
      transport: mockTransport(101n),
    });
    const second = await registerAgent({
      name: 'provider-hedera',
      chain: baseSepolia,
      chainKey: 'base-sepolia',
      privateKey: PK,
      tokenUri: 'ipfs://should-not-be-used',
      registryAddress: REGISTRY,
      storePath,
      transport: mockTransport(999n), // would decode a different agentId if it ran again
    });
    expect(second).toEqual(first);
    expect(second.agentId).toBe('101');
  });

  it('is keyed per chain: the same name registers independently on a second chain', async () => {
    await registerAgent({
      name: 'provider-hedera',
      chain: baseSepolia,
      chainKey: 'base-sepolia',
      privateKey: PK,
      tokenUri: 'ipfs://fixture/101',
      registryAddress: REGISTRY,
      storePath,
      transport: mockTransport(101n),
    });
    const onSecondChain = await registerAgent({
      name: 'provider-hedera',
      chain: baseSepolia, // reused chain object; chainKey is what distinguishes the store slot
      chainKey: 'hedera-testnet',
      privateKey: PK,
      tokenUri: 'ipfs://fixture/hedera-101',
      registryAddress: REGISTRY,
      storePath,
      transport: mockTransport(202n),
    });
    expect(onSecondChain.agentId).toBe('202');
    expect(onSecondChain.chain).toBe('hedera-testnet');
  });

  it('throws when no Registered event can be decoded from the receipt', async () => {
    const noEventTransport = custom({
      async request({ method }: { method: string }) {
        switch (method) {
          case 'eth_chainId':
            return toHex(baseSepolia.id);
          case 'eth_gasPrice':
          case 'eth_maxPriorityFeePerGas':
            return '0x3b9aca00';
          case 'eth_getTransactionCount':
            return '0x0';
          case 'eth_estimateGas':
            return '0x186a0';
          case 'eth_getBlockByNumber':
            return { baseFeePerGas: '0x3b9aca00', gasLimit: '0x1c9c380', number: '0x1', hash: TX_HASH, timestamp: '0x1' };
          case 'eth_sendRawTransaction':
            return TX_HASH;
          case 'eth_getTransactionReceipt':
            return {
              transactionHash: TX_HASH,
              blockHash: TX_HASH,
              blockNumber: '0x1',
              transactionIndex: '0x0',
              from: OWNER,
              to: REGISTRY,
              status: '0x1',
              gasUsed: '0x186a0',
              effectiveGasPrice: '0x3b9aca00',
              cumulativeGasUsed: '0x186a0',
              contractAddress: null,
              logs: [],
              logsBloom: `0x${'0'.repeat(512)}`,
              type: '0x2',
            };
          default:
            throw new Error(`unhandled ${method}`);
        }
      },
    });
    await expect(
      registerAgent({
        name: 'no-event',
        chain: baseSepolia,
        chainKey: 'base-sepolia',
        privateKey: PK,
        tokenUri: 'ipfs://x',
        registryAddress: REGISTRY,
        storePath,
        transport: noEventTransport,
      }),
    ).rejects.toThrow(/Registered event/);
  });
});

describe('Registered event decoding (unit)', () => {
  it('decodes agentId and owner from a raw log', () => {
    const log = registeredLog(101n, 'ipfs://fixture/101');
    const decoded = decodeEventLog({ abi: identityRegistryAbi, data: log.data, topics: log.topics as Log['topics'], eventName: 'Registered' });
    const args = decoded.args as unknown as { agentId: bigint; owner: string };
    expect(args.agentId).toBe(101n);
    expect(args.owner.toLowerCase()).toBe(OWNER.toLowerCase());
  });
});
