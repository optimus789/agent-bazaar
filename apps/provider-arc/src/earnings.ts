import { jsonlLogger } from '@bazaar/shared';

export interface PaymentRecord {
  ts: string;
  route: string;
  payer?: string;
  amountUsd: number;
  network?: string;
  transaction?: string;
}

export interface EarningsSnapshot {
  totalPayments: number;
  totalUsd: number;
  recent: PaymentRecord[];
}

/**
 * In-memory + JSONL log of settled payments this process has seen. Not a
 * substitute for `GatewayClient.getBalances()` (the source of truth for
 * withdrawable balance) — this is the "list of payments" half of GET /v1/seller/earnings.
 */
export class Ledger {
  private readonly records: PaymentRecord[] = [];
  private readonly log: ReturnType<typeof jsonlLogger>;

  constructor(log: ReturnType<typeof jsonlLogger> = jsonlLogger('provider-arc-payments')) {
    this.log = log;
  }

  async record(entry: PaymentRecord): Promise<void> {
    this.records.push(entry);
    await this.log.write({ kind: 'paid.request', ...entry });
  }

  snapshot(limit = 50): EarningsSnapshot {
    const totalUsd = this.records.reduce((sum, r) => sum + r.amountUsd, 0);
    return { totalPayments: this.records.length, totalUsd, recent: this.records.slice(-limit).reverse() };
  }
}
