import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jsonlLogger } from '../src/log.js';
import { makeArcBuyer, type GatewayClientLike } from '../src/arcBuyer.js';

/**
 * Fake matching the subset of GatewayClient's surface makeArcBuyer uses.
 * `pay()` runs the registered onBeforePaymentCreation hook first (mirroring
 * the real SDK's behaviour) so the cap logic is exercised end-to-end.
 */
function fakeGatewayClient(amountAtomicPerCall: bigint): GatewayClientLike {
  let hook: ((ctx: { selectedRequirements: { amount: string } }) => Promise<void | { abort: true; reason: string }>) | undefined;
  let calls = 0;
  return {
    onBeforePaymentCreation(h) {
      hook = h;
      return this;
    },
    async pay<T>(url: string) {
      calls++;
      const amount = amountAtomicPerCall;
      const result = hook ? await hook({ selectedRequirements: { amount: amount.toString() } }) : undefined;
      if (result && 'abort' in result && result.abort) throw new Error(result.reason);
      return { data: { ok: true, url, call: calls } as T, amount, transaction: `0xmocktx${calls}` };
    },
  };
}

describe('makeArcBuyer', () => {
  // Every test injects an isolated tmpdir logger. makeArcBuyer defaults to the
  // real jsonlLogger('arc-buyer'), which resolves against the repo-wide data/
  // directory and would otherwise pollute the live demo dataset with test runs.
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'arc-buyer-test-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('pays and tracks spend in USD (6-decimal atomic USDC)', async () => {
    const buyer = makeArcBuyer({ privateKey: `0x${'11'.repeat(32)}`, capUsd: 1, client: fakeGatewayClient(500_000n), log: jsonlLogger('arc-buyer', dir) }); // $0.50 per call
    const { data, receipt } = await buyer.pay('http://x/route');
    expect(data).toEqual({ ok: true, url: 'http://x/route', call: 1 });
    expect(receipt.amountUsd).toBeCloseTo(0.5);
    expect(receipt.rail).toBe('arc');
    expect(receipt.txId).toBe('0xmocktx1');
    expect(buyer.spentUsd()).toBeCloseTo(0.5);
    expect(buyer.remainingUsd()).toBeCloseTo(0.5);
  });

  it('accumulates spend across multiple calls', async () => {
    const buyer = makeArcBuyer({ privateKey: `0x${'11'.repeat(32)}`, capUsd: 10, client: fakeGatewayClient(1_000_000n), log: jsonlLogger('arc-buyer', dir) }); // $1 per call
    await buyer.pay('http://x/a');
    await buyer.pay('http://x/b');
    expect(buyer.spentUsd()).toBeCloseTo(2);
    expect(buyer.remainingUsd()).toBeCloseTo(8);
  });

  it('the cap hook aborts a call that would exceed the cap, and nothing is added to spend', async () => {
    const buyer = makeArcBuyer({ privateKey: `0x${'11'.repeat(32)}`, capUsd: 1, client: fakeGatewayClient(1_500_000n), log: jsonlLogger('arc-buyer', dir) }); // $1.50 > $1 cap
    await expect(buyer.pay('http://x/too-much')).rejects.toThrow(/spending cap exceeded/);
    expect(buyer.spentUsd()).toBe(0);
  });

  it('the cap hook aborts the call that would push spend over the cap, even after partial spend', async () => {
    const buyer = makeArcBuyer({ privateKey: `0x${'11'.repeat(32)}`, capUsd: 1, client: fakeGatewayClient(700_000n), log: jsonlLogger('arc-buyer', dir) }); // $0.70/call
    await buyer.pay('http://x/first'); // spend now $0.70, within cap
    await expect(buyer.pay('http://x/second')).rejects.toThrow(/spending cap exceeded/); // $0.70 + $0.70 > $1
    expect(buyer.spentUsd()).toBeCloseTo(0.7); // failed call did not add to spend
  });
});
