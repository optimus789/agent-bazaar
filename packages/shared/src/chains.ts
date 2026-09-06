import { defineChain } from 'viem';
import { baseSepolia, sepolia } from 'viem/chains';

/** Chain facts the whole repo relies on. Keep this the single source of truth. */

export const HEDERA_TESTNET = defineChain({
  id: 296,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet.hashio.io/api'] } },
  blockExplorers: { default: { name: 'HashScan', url: 'https://hashscan.io/testnet' } },
  testnet: true,
});

/** Arc: USDC is the native gas token with 18 decimals; the ERC-20 view at 0x3600… uses 6. */
export const ARC_TESTNET = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'], webSocket: ['wss://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' } },
  testnet: true,
});

export const ARC_MAINNET_CHAIN_ID = 5042;

export const BASE_SEPOLIA = baseSepolia;
export const ETH_SEPOLIA = sepolia;

export const ARC_USDC_ERC20 = '0x3600000000000000000000000000000000000000' as const; // 6 decimals
export const ARC_USDC_ERC20_DECIMALS = 6;
export const ARC_NATIVE_USDC_DECIMALS = 18;

export const HEDERA_MIRROR_NODE_TESTNET = 'https://testnet.mirrornode.hedera.com';

export type ChainKey = 'hedera-testnet' | 'arc-testnet' | 'base-sepolia' | 'eth-sepolia';

export const CHAIN_IDS: Record<ChainKey, number> = {
  'hedera-testnet': 296,
  'arc-testnet': 5042002,
  'base-sepolia': 84532,
  'eth-sepolia': 11155111,
};

export function explorerTxUrl(chain: ChainKey, txIdOrHash: string): string {
  switch (chain) {
    case 'hedera-testnet':
      return `https://hashscan.io/testnet/transaction/${txIdOrHash}`;
    case 'arc-testnet':
      return `https://testnet.arcscan.app/tx/${txIdOrHash}`;
    case 'base-sepolia':
      return `https://sepolia.basescan.org/tx/${txIdOrHash}`;
    case 'eth-sepolia':
      return `https://sepolia.etherscan.io/tx/${txIdOrHash}`;
  }
}
