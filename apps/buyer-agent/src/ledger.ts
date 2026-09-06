import type { PaymentReceipt } from '@bazaar/shared';

/**
 * Hard budget cap enforced in code, not by the model. Every tool that spends
 * money must call `ledger.reserve(amountUsd)` BEFORE making the payment and
 * `ledger.record(receipt)` after it settles — `reserve` throws synchronously
 * if the amount would exceed what's left, so a tool can refuse the call before
 * it ever touches the network.
 */
export class BudgetLedger {
  private spent = 0;
  private readonly receipts: PaymentReceipt[] = [];

  constructor(public readonly budgetUsd: number) {
    if (!Number.isFinite(budgetUsd) || budgetUsd < 0) throw new Error(`invalid budget: ${budgetUsd}`);
  }

  get spentUsd(): number {
    return this.spent;
  }

  get remainingUsd(): number {
    return Math.max(0, this.budgetUsd - this.spent);
  }

  get allReceipts(): readonly PaymentReceipt[] {
    return this.receipts;
  }

  /** Throws if `amountUsd` would exceed the remaining budget. Call before paying. */
  reserve(amountUsd: number): void {
    if (!Number.isFinite(amountUsd) || amountUsd < 0) throw new Error(`invalid amount: ${amountUsd}`);
    if (amountUsd > this.remainingUsd + 1e-9) {
      throw new Error(`budget exceeded: $${amountUsd.toFixed(6)} requested, $${this.remainingUsd.toFixed(6)} remaining of $${this.budgetUsd.toFixed(6)}`);
    }
  }

  /** Record a settled payment. Call only after `reserve` succeeded and the payment actually went through. */
  record(receipt: PaymentReceipt): void {
    this.spent += receipt.amountUsd;
    this.receipts.push(receipt);
  }

  status(): { budgetUsd: number; spentUsd: number; remainingUsd: number; receipts: readonly PaymentReceipt[] } {
    return { budgetUsd: this.budgetUsd, spentUsd: this.spent, remainingUsd: this.remainingUsd, receipts: this.receipts };
  }
}
