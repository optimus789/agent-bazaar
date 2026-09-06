import { PrivateKey } from '@hiero-ledger/sdk';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { createClientHederaSigner } from '@x402/hedera';
import { HEDERA_X402_NETWORK_TESTNET, jsonlLogger, type PaymentReceipt } from '@bazaar/shared';

export interface HederaRailOptions {
  accountId: string;
  privateKeyEcdsaHex: string;
  log?: ReturnType<typeof jsonlLogger>;
}

export interface HederaRail {
  /**
   * @param priceUsd the known catalog price for this route — the x402 layer
   * settles the exact amount on-chain, but doesn't surface it back through
   * `wrapFetchWithPayment`'s Response, so the caller (which read the price
   * from the provider's /catalog before calling) supplies it for the budget
   * ledger and the receipt.
   */
  pay<T = unknown>(url: string, body: unknown, priceUsd: number): Promise<{ data: T; receipt: PaymentReceipt }>;
}

/**
 * Pays x402-gated Hedera testnet endpoints. Mirrors the pattern verified against
 * the real SDKs in apps/provider-hedera and the Hedera x402 reference PoC:
 * one x402Client with the Hedera exact scheme registered once per process
 * (signers are stateful — see WP06 gotcha), then `wrapFetchWithPayment` handles
 * the 402 -> sign -> retry cycle transparently.
 */
export function makeHederaRail(opts: HederaRailOptions): HederaRail {
  const signer = createClientHederaSigner(opts.accountId, PrivateKey.fromStringECDSA(opts.privateKeyEcdsaHex), { network: HEDERA_X402_NETWORK_TESTNET });
  const client = new x402Client().register(HEDERA_X402_NETWORK_TESTNET, new ExactHederaScheme(signer));
  const paidFetch = wrapFetchWithPayment(fetch, client);
  const log = opts.log ?? jsonlLogger('buyer-agent-hedera');

  return {
    async pay<T = unknown>(url: string, body: unknown, priceUsd: number) {
      const res = await paidFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`hedera rail: ${res.status} ${res.statusText} from ${url}`);
      const data = (await res.json()) as T;
      const usageHeader = res.headers.get('x-bazaar-usage');
      const paymentResponseHeader = res.headers.get('payment-response') ?? res.headers.get('x-payment-response');
      let txId: string | undefined;
      try {
        if (paymentResponseHeader) {
          const decoded = JSON.parse(Buffer.from(paymentResponseHeader, 'base64').toString('utf8')) as { transaction?: string };
          txId = decoded.transaction;
        }
      } catch {
        /* best effort */
      }
      const receipt: PaymentReceipt = { rail: 'hedera', chain: 'hedera-testnet', amountUsd: priceUsd, asset: 'USDC', txId, url, ts: new Date().toISOString() };
      await log.write({ kind: 'hedera.payment', url, priceUsd, txId, usage: usageHeader });
      return { data, receipt };
    },
  };
}
