import type { ChainKey } from './chains.js';

/**
 * ERC-8004 reference registries. The 8004 team deployed the same addresses on
 * Ethereum Sepolia, Base Sepolia and Hedera testnet (erc-8004/erc-8004-contracts README).
 */
export const ERC8004_IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const;
export const ERC8004_REPUTATION_REGISTRY = '0x8004B663056A597Dffe9eCcC1965A193B7388713' as const;

export const ERC8004_CHAINS: ChainKey[] = ['base-sepolia', 'eth-sepolia', 'hedera-testnet'];

/** CAIP-10 style registry reference used in registration files: eip155:<chainId>:<address> */
export function registryRef(chainId: number, registry: `0x${string}` = ERC8004_IDENTITY_REGISTRY): string {
  return `eip155:${chainId}:${registry}`;
}

/**
 * Minimal ABI fragments. WP04 must confirm exact signatures against the contracts repo
 * before writing; these are placeholders for typing and tests only.
 */
export const IDENTITY_REGISTRY_ABI_MIN = [
  {
    type: 'function',
    name: 'tokenURI',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;
