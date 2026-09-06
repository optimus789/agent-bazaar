import { makeArcBuyer, type ArcBuyer, type PaymentReceipt } from '@bazaar/shared';

export interface ArcRailOptions {
  privateKey: `0x${string}`;
  /** overall session cap passed straight to makeArcBuyer's own hook, as a second line of defence behind BudgetLedger */
  capUsd: number;
}

export interface ArcRail {
  pay<T = unknown>(url: string, body: unknown): Promise<{ data: T; receipt: PaymentReceipt }>;
  readonly buyer: ArcBuyer;
}

/** Thin re-export of WP05's makeArcBuyer under the rail interface the agent's tools expect. */
export function makeArcRail(opts: ArcRailOptions): ArcRail {
  const buyer = makeArcBuyer({ privateKey: opts.privateKey, capUsd: opts.capUsd });
  return {
    buyer,
    pay<T = unknown>(url: string, body: unknown) {
      return buyer.pay<T>(url, body);
    },
  };
}
