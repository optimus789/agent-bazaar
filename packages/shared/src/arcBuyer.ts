import { GatewayClient } from '@circle-fin/x402-batching/client';
import type { Hex } from 'viem';
import { ARC_USDC_ERC20_DECIMALS } from './chains.js';
import { jsonlLogger } from './log.js';
import type { PaymentReceipt } from './types.js';

/**
 * Thin wrapper around Circle's GatewayClient enforcing a hard per-session USDC
 * spending cap via the SDK's own `onBeforePaymentCreation` hook (confirmed against
 * @circle-fin/x402-batching@3.4.0 dist/client/index.d.ts — the hook receives
 * `selectedRequirements.amount` as a decimal-string of atomic USDC units, 6dp,
 * and returning `{ abort: true, reason }` stops `pay()` before it signs).
 */
export interface ArcBuyerOptions {
  privateKey: Hex;
  /** 'arcTestnet' | 'arcMainnet' style key from GATEWAY_DOMAINS; default 'arcTestnet' */
  chain?: 'arcTestnet' | 'arc';
  capUsd: number;
  rpcUrl?: string;
  log?: ReturnType<typeof jsonlLogger>;
  /** injected for tests; production callers should omit this and let makeArcBuyer construct a real GatewayClient */
  client?: GatewayClientLike;
}

/** The subset of GatewayClient's surface makeArcBuyer actually uses — lets tests inject a fake. */
export interface GatewayClientLike {
  onBeforePaymentCreation(hook: (ctx: { selectedRequirements: { amount: string } }) => Promise<void | { abort: true; reason: string }>): unknown;
  pay<T = unknown>(url: string, options?: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; headers?: Record<string, string> }): Promise<{ data: T; amount: bigint; transaction: string }>;
}

export interface ArcBuyer {
  readonly client: GatewayClientLike;
  spentUsd(): number;
  remainingUsd(): number;
  pay<T = unknown>(url: string, body?: unknown): Promise<{ data: T; receipt: PaymentReceipt }>;
}

function atomicUsdcToUsd(amount: string | bigint): number {
  return Number(amount) / 10 ** ARC_USDC_ERC20_DECIMALS;
}

export function makeArcBuyer(opts: ArcBuyerOptions): ArcBuyer {
  let spent = 0;
  const log = opts.log ?? jsonlLogger('arc-buyer');
  const client: GatewayClientLike =
    opts.client ?? new GatewayClient({ chain: opts.chain ?? 'arcTestnet', privateKey: opts.privateKey, rpcUrl: opts.rpcUrl });

  client.onBeforePaymentCreation(async (ctx) => {
    const amountUsd = atomicUsdcToUsd(ctx.selectedRequirements.amount);
    if (spent + amountUsd > opts.capUsd) {
      return { abort: true, reason: `spending cap exceeded: spent $${spent.toFixed(6)} + $${amountUsd.toFixed(6)} > cap $${opts.capUsd.toFixed(6)}` };
    }
    return undefined;
  });

  return {
    client,
    spentUsd: () => spent,
    remainingUsd: () => Math.max(0, opts.capUsd - spent),
    async pay<T = unknown>(url: string, body?: unknown) {
      const result = await client.pay<T>(url, body === undefined ? undefined : { method: 'POST', body });
      const amountUsd = atomicUsdcToUsd(result.amount);
      spent += amountUsd;
      const receipt: PaymentReceipt = {
        rail: 'arc',
        chain: 'arc-testnet',
        amountUsd,
        asset: 'USDC',
        txId: result.transaction,
        url,
        ts: new Date().toISOString(),
      };
      await log.write({ kind: 'arc.payment', ...receipt });
      return { data: result.data, receipt };
    },
  };
}
