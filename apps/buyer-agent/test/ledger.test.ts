import { describe, expect, it } from 'vitest';
import type { PaymentReceipt } from '@bazaar/shared';
import { BudgetLedger } from '../src/ledger.js';

function receipt(amountUsd: number, rail: PaymentReceipt['rail'] = 'hedera'): PaymentReceipt {
  return { rail, chain: 'hedera-testnet', amountUsd, asset: 'USDC', url: 'http://x', ts: new Date().toISOString() };
}

describe('BudgetLedger', () => {
  it('starts with the full budget unspent', () => {
    const l = new BudgetLedger(0.05);
    expect(l.spentUsd).toBe(0);
    expect(l.remainingUsd).toBe(0.05);
    expect(l.allReceipts).toEqual([]);
  });

  it('reserve succeeds within budget and is a no-op (does not spend)', () => {
    const l = new BudgetLedger(0.05);
    expect(() => l.reserve(0.02)).not.toThrow();
    expect(l.spentUsd).toBe(0); // reserve alone doesn't spend
  });

  it('reserve throws when the amount would exceed remaining budget — this is the hard cap', () => {
    const l = new BudgetLedger(0.02);
    expect(() => l.reserve(0.021)).toThrow(/budget exceeded/);
  });

  it('record actually spends and reserve reflects it afterwards', () => {
    const l = new BudgetLedger(0.02);
    l.reserve(0.01);
    l.record(receipt(0.01));
    expect(l.spentUsd).toBeCloseTo(0.01);
    expect(l.remainingUsd).toBeCloseTo(0.01);
    expect(() => l.reserve(0.011)).toThrow(/budget exceeded/);
    expect(() => l.reserve(0.01)).not.toThrow();
  });

  it('accumulates multiple receipts and totals correctly', () => {
    const l = new BudgetLedger(1);
    l.record(receipt(0.3, 'hedera'));
    l.record(receipt(0.2, 'arc'));
    l.record(receipt(0.01, 'graph'));
    expect(l.spentUsd).toBeCloseTo(0.51);
    expect(l.remainingUsd).toBeCloseTo(0.49);
    expect(l.allReceipts).toHaveLength(3);
    expect(l.allReceipts.map((r) => r.rail)).toEqual(['hedera', 'arc', 'graph']);
  });

  it('is tolerant of floating point noise at the exact boundary', () => {
    const l = new BudgetLedger(0.003);
    l.record(receipt(0.001));
    l.record(receipt(0.001));
    expect(() => l.reserve(0.001)).not.toThrow(); // 0.001+0.001+0.001 === 0.003, not > within epsilon
  });

  it('rejects an invalid budget or amount', () => {
    expect(() => new BudgetLedger(-1)).toThrow();
    expect(() => new BudgetLedger(Number.NaN)).toThrow();
    const l = new BudgetLedger(1);
    expect(() => l.reserve(-0.01)).toThrow();
    expect(() => l.reserve(Number.NaN)).toThrow();
  });

  it('status() returns a consistent snapshot', () => {
    const l = new BudgetLedger(0.1);
    l.record(receipt(0.04));
    const s = l.status();
    expect(s.budgetUsd).toBe(0.1);
    expect(s.spentUsd).toBeCloseTo(0.04);
    expect(s.remainingUsd).toBeCloseTo(0.06);
    expect(s.receipts).toBe(l.allReceipts);
  });
});
