import { describe, expect, it } from 'vitest';
import { loadEnv, requireEnv } from '../src/env.js';

describe('loadEnv', () => {
  it('applies defaults and parses MOCK', () => {
    const env = loadEnv({ MOCK: '1' });
    expect(env.MOCK).toBe(true);
    expect(env.X402_TESTNET_FACILITATOR_URL).toBe('https://api.testnet.blocky402.com');
    expect(env.PROVIDER_HEDERA_PORT).toBe(4021);
    expect(env.ARC_NETWORK).toBe('testnet');
  });
  it('rejects malformed hedera ids', () => {
    expect(() => loadEnv({ HEDERA_BUYER_ACCOUNT_ID: 'abc' })).toThrow(/HEDERA_BUYER_ACCOUNT_ID/);
  });
  it('requireEnv names the missing keys', () => {
    const env = loadEnv({});
    expect(() => requireEnv(env, 'GRAPH_API_KEY', 'HEDERA_BUYER_ACCOUNT_ID')).toThrow(/GRAPH_API_KEY, HEDERA_BUYER_ACCOUNT_ID/);
  });
});
