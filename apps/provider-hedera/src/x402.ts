import { HTTPFacilitatorClient, x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import type { PaymentPayload, PaymentRequirements, SettleResponse, SupportedResponse, VerifyResponse } from '@x402/core/types';
import { ExactHederaScheme } from '@x402/hedera/exact/server';
import { BLOCKY402_TESTNET, BLOCKY402_TESTNET_FEE_PAYER, HEDERA_X402_NETWORK_TESTNET } from '@bazaar/shared';

/**
 * Resource server that verifies and settles Hedera payments through a facilitator.
 * The Hedera prize requires Blocky402, so that is the default.
 */
export function createResourceServer(facilitator: FacilitatorClient | string = BLOCKY402_TESTNET): x402ResourceServer {
  const client = typeof facilitator === 'string' ? new HTTPFacilitatorClient({ url: facilitator }) : facilitator;
  return new x402ResourceServer(client).register('hedera:*', new ExactHederaScheme({}));
}

/**
 * In-process facilitator for tests and MOCK=1 runs. It approves any well-formed
 * payload and returns a fake transaction id, so the HTTP surface (402 shape, headers,
 * receipts) can be exercised without touching the network.
 */
export class MockFacilitatorClient implements FacilitatorClient {
  readonly settled: { payload: PaymentPayload; requirements: PaymentRequirements }[] = [];
  constructor(private readonly opts: { rejectVerify?: boolean } = {}) {}

  async verify(paymentPayload: PaymentPayload, _req: PaymentRequirements): Promise<VerifyResponse> {
    if (this.opts.rejectVerify) return { isValid: false, invalidReason: 'mock_rejected' };
    return { isValid: true, payer: 'mock-payer' };
  }

  async settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
    this.settled.push({ payload: paymentPayload, requirements: paymentRequirements });
    return { success: true, transaction: `0.0.0@${Date.now()}.mock`, network: paymentRequirements.network, payer: 'mock-payer' };
  }

  async getSupported(): Promise<SupportedResponse> {
    return {
      kinds: [{ x402Version: 2, scheme: 'exact', network: HEDERA_X402_NETWORK_TESTNET, extra: { feePayer: BLOCKY402_TESTNET_FEE_PAYER } }],
      extensions: [],
      signers: { 'hedera:*': [BLOCKY402_TESTNET_FEE_PAYER] },
    };
  }
}
