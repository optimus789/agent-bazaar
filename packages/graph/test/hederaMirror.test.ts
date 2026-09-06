import { describe, expect, it, vi } from 'vitest';
import { fetchHederaTokenTransfers } from '../src/hederaMirror.js';

/**
 * Fixture below is a trimmed, real response shape captured from
 * testnet.mirrornode.hedera.com on 2026-09-07 (see docs/STATUS.md WP11) —
 * not invented, to keep the parsing logic honest about the actual API shape.
 */
const REAL_SHAPE_RESPONSE = {
  transactions: [
    {
      transaction_id: '0.0.7162784-1788725205-145653460',
      consensus_timestamp: '1788725218.545371685',
      name: 'CRYPTOTRANSFER',
      result: 'SUCCESS',
      token_transfers: [
        { token_id: '0.0.429274', account: '0.0.10392709', amount: -500, is_approval: false },
        { token_id: '0.0.429274', account: '0.0.10392781', amount: 500, is_approval: false },
      ],
    },
    {
      transaction_id: '0.0.999-111-222',
      consensus_timestamp: '1788725100.0',
      name: 'CRYPTOTRANSFER',
      result: 'SUCCESS',
      token_transfers: [{ token_id: '0.0.111111', account: '0.0.10392709', amount: -100, is_approval: false }],
    },
  ],
  links: { next: null },
};

describe('fetchHederaTokenTransfers', () => {
  it('normalises real mirror-node transactions filtered to one token and account', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(REAL_SHAPE_RESPONSE), { status: 200 }));
    const result = await fetchHederaTokenTransfers('0.0.10392709', '0.0.429274', { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      txId: '0.0.7162784-1788725205-145653460',
      amount: -500,
      accountId: '0.0.10392709',
      tokenId: '0.0.429274',
      counterparty: '0.0.10392781',
      result: 'SUCCESS',
    });
  });

  it('returns [] when the account has no transfers of that token', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ transactions: [], links: { next: null } }), { status: 200 }));
    const result = await fetchHederaTokenTransfers('0.0.999999', '0.0.429274', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual([]);
  });

  it('throws with a clear message on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500, statusText: 'Internal Server Error' }));
    await expect(fetchHederaTokenTransfers('0.0.1', '0.0.2', { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow('500');
  });

  it('passes account.id, token filter is applied client-side, and respects the limit option', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('account.id=0.0.10392709');
      expect(url).toContain('limit=10');
      return new Response(JSON.stringify({ transactions: [], links: { next: null } }), { status: 200 });
    });
    await fetchHederaTokenTransfers('0.0.10392709', '0.0.429274', { limit: 10, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
