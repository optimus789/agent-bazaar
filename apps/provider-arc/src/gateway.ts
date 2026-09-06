import { createGatewayMiddleware } from '@circle-fin/x402-batching/server';
import type { RequestHandler } from 'express';

/** The subset of GatewayMiddleware's surface the server uses — lets tests inject a mock. */
export interface GatewayLike {
  require(price: string): RequestHandler;
}

export interface CreateGatewayOptions {
  sellerAddress: string;
  facilitatorUrl?: string;
  networks?: string | string[];
}

export function createGateway(opts: CreateGatewayOptions): GatewayLike {
  return createGatewayMiddleware({ sellerAddress: opts.sellerAddress, facilitatorUrl: opts.facilitatorUrl, networks: opts.networks }) as unknown as GatewayLike;
}

/**
 * MOCK gateway for offline tests and `MOCK=1` runs: every `require(price)` route
 * answers unpaid requests with a 402 shaped like the real x402/Gateway response,
 * and treats any request carrying an `X-PAYMENT`/`Payment-Signature` header as
 * paid, attaching a synthetic `req.payment` the same shape GatewayMiddleware sets.
 */
export function createMockGateway(sellerAddress: string): GatewayLike {
  return {
    require(price: string): RequestHandler {
      return (req, res, next) => {
        const paid = req.header('x-payment') ?? req.header('payment-signature');
        if (!paid) {
          res.status(402).json({
            x402Version: 2,
            error: 'Payment required',
            accepts: [{ scheme: 'exact', network: 'eip155:5042002', amount: String(Math.round(parseFloat(price.replace('$', '')) * 1_000_000)), asset: 'USDC', payTo: sellerAddress }],
          });
          return;
        }
        (req as typeof req & { payment: Record<string, unknown> }).payment = {
          verified: true,
          payer: '0xmockpayer0000000000000000000000000000',
          amount: String(Math.round(parseFloat(price.replace('$', '')) * 1_000_000)),
          network: 'eip155:5042002',
          transaction: `0xmocktx${Date.now()}`,
        };
        next();
      };
    },
  };
}
