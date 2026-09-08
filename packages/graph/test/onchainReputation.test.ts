import { beforeEach, describe, expect, it, vi } from 'vitest';

const readContract = vi.fn();
const getLogs = vi.fn();
const getBlockNumber = vi.fn(async () => 1_000_000n);

vi.mock('viem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem')>()),
  createPublicClient: () => ({ readContract, getLogs, getBlockNumber }),
}));

const { readOnchainReputation, __clearOnchainReputationCache } = await import('../src/onchainReputation.js');

describe('readOnchainReputation', () => {
  beforeEach(() => {
    __clearOnchainReputationCache();
    readContract.mockReset();
    getLogs.mockReset();
  });

  it('reports no feedback without calling getSummary when the agent has none', async () => {
    getLogs.mockResolvedValue([]);

    const res = await readOnchainReputation('base-sepolia', '9179');

    expect(res).toEqual({ totalFeedback: 0 });
    // getSummary reverts with "clientAddresses required" on an empty list, so
    // it must not be reached at all in this case.
    expect(readContract).not.toHaveBeenCalled();
  });

  it('aggregates via getSummary using the client addresses found in NewFeedback logs', async () => {
    getLogs.mockResolvedValue([
      { args: { clientAddress: '0xf580357a000000000000000000000000000000aa' } },
      { args: { clientAddress: '0xf580357a000000000000000000000000000000aa' } },
      { args: { clientAddress: '0xbbbbbbbb000000000000000000000000000000bb' } },
    ]);
    // count=6, aggregate=70, decimals=0 — the real shape agent 9179 returns.
    readContract.mockResolvedValue([6n, 70n, 0]);

    const res = await readOnchainReputation('base-sepolia', '9179');

    expect(res).toEqual({ totalFeedback: 6, avgScore: 70 });
    const clients = readContract.mock.calls[0]![0].args[1];
    expect(clients).toHaveLength(2); // deduped
  });

  it('applies valueDecimals when scaling the aggregate score', async () => {
    getLogs.mockResolvedValue([{ args: { clientAddress: '0xf580357a000000000000000000000000000000aa' } }]);
    readContract.mockResolvedValue([2n, 8625n, 2]);

    await expect(readOnchainReputation('base-sepolia', '9180')).resolves.toEqual({ totalFeedback: 2, avgScore: 86.25 });
  });

  it('serves the cached value instead of re-scanning on a repeat read', async () => {
    getLogs.mockResolvedValue([{ args: { clientAddress: '0xf580357a000000000000000000000000000000aa' } }]);
    readContract.mockResolvedValue([6n, 70n, 0]);

    const first = await readOnchainReputation('base-sepolia', '9179');
    const callsAfterFirst = getLogs.mock.calls.length;
    const second = await readOnchainReputation('base-sepolia', '9179');

    expect(second).toEqual(first);
    // The scan is ~22 RPC round-trips; a cache hit must not repeat any of them.
    expect(getLogs.mock.calls.length).toBe(callsAfterFirst);
  });
});
