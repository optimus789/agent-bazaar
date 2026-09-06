import { describe, expect, it } from 'vitest';
import { ARC_TESTNET, CHAIN_IDS, HEDERA_TESTNET, explorerTxUrl } from '../src/chains.js';

describe('chains', () => {
  it('has the documented chain ids', () => {
    expect(HEDERA_TESTNET.id).toBe(296);
    expect(ARC_TESTNET.id).toBe(5042002);
    expect(CHAIN_IDS['base-sepolia']).toBe(84532);
  });
  it('builds explorer links', () => {
    expect(explorerTxUrl('hedera-testnet', '0.0.1@1.2')).toContain('hashscan.io/testnet');
    expect(explorerTxUrl('arc-testnet', '0xabc')).toBe('https://testnet.arcscan.app/tx/0xabc');
  });
});
