import 'dotenv/config';
import express, { type Express, type Request } from 'express';
import { GatewayClient } from '@circle-fin/x402-batching/client';
import { loadEnv, requireEnv, type Env } from '@bazaar/shared';
import { CATALOG, catalogPriceString } from './catalog.js';
import { classifyRisk, summarise } from './tasks.js';
import { Ledger } from './earnings.js';
import { createGateway, createMockGateway, type GatewayLike } from './gateway.js';

export interface AppDeps {
  env: Env;
  sellerAddress: string;
  gateway: GatewayLike;
  ledger: Ledger;
  /** GatewayClient used only for GET /health and the withdraw route; omitted in MOCK mode */
  gatewayClient?: GatewayClient;
  adminToken: string;
}

interface RequestWithPayment extends Request {
  payment?: { verified: boolean; payer?: string; amount?: string; network?: string; transaction?: string };
}

function requireAdmin(token: string): express.RequestHandler {
  return (req, res, next) => {
    if (req.header('x-admin-token') !== token) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', async (_req, res) => {
    let gatewayBalanceUsd: number | undefined;
    if (deps.gatewayClient) {
      try {
        const balances = await deps.gatewayClient.getBalances();
        gatewayBalanceUsd = Number(balances.gateway.available) / 1e6;
      } catch {
        gatewayBalanceUsd = undefined;
      }
    }
    res.json({ service: 'agent-bazaar/provider-arc', chain: 'arc-testnet', sellerAddress: deps.sellerAddress, gatewayBalanceUsd, mock: deps.env.MOCK });
  });

  app.get('/catalog', (_req, res) => {
    res.json({ provider: 'Bazaar Task Runner (Arc)', rail: 'arc', network: 'eip155:5042002', payTo: deps.sellerAddress, routes: CATALOG });
  });

  function record(req: RequestWithPayment, route: string, priceUsd: number) {
    return deps.ledger.record({
      ts: new Date().toISOString(),
      route,
      payer: req.payment?.payer,
      amountUsd: priceUsd,
      network: req.payment?.network,
      transaction: req.payment?.transaction,
    });
  }

  const summariseRoute = CATALOG.find((r) => r.path === '/v1/task/summarise')!;
  app.post('/v1/task/summarise', deps.gateway.require(catalogPriceString(summariseRoute)), async (req, res) => {
    const { text } = (req.body ?? {}) as { text?: string };
    if (!text) return res.status(400).json({ error: 'text required' });
    try {
      const result = await summarise(text);
      await record(req, 'POST /v1/task/summarise', summariseRoute.priceUsd);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  const classifyRoute = CATALOG.find((r) => r.path === '/v1/task/classify-risk')!;
  app.post('/v1/task/classify-risk', deps.gateway.require(catalogPriceString(classifyRoute)), async (req, res) => {
    try {
      const result = classifyRisk(req.body ?? {});
      await record(req, 'POST /v1/task/classify-risk', classifyRoute.priceUsd);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/v1/seller/earnings', requireAdmin(deps.adminToken), async (_req, res) => {
    const ledgerSnapshot = deps.ledger.snapshot();
    let gateway: unknown;
    if (deps.gatewayClient) {
      try {
        const balances = await deps.gatewayClient.getBalances();
        // Balances carries bigint fields; JSON.stringify throws on those, so use the formatted strings.
        gateway = {
          wallet: { formatted: balances.wallet.formatted },
          gateway: {
            total: balances.gateway.formattedTotal,
            available: balances.gateway.formattedAvailable,
            withdrawing: balances.gateway.formattedWithdrawing,
            withdrawable: balances.gateway.formattedWithdrawable,
          },
        };
      } catch (err) {
        gateway = { error: err instanceof Error ? err.message : String(err) };
      }
    }
    res.json({ ledger: ledgerSnapshot, gateway });
  });

  app.post('/v1/seller/withdraw', requireAdmin(deps.adminToken), async (req, res) => {
    if (!deps.gatewayClient) return res.status(400).json({ error: 'no live GatewayClient in this mode' });
    const { amount, chain } = (req.body ?? {}) as { amount?: string; chain?: string };
    if (!amount) return res.status(400).json({ error: 'amount required (decimal USDC string)' });
    try {
      const result = await deps.gatewayClient.withdraw(amount, chain ? { chain: chain as never } : undefined);
      // bigint fields don't survive JSON.stringify; the formatted string is what callers want anyway.
      return res.json({ ...result, amount: result.amount.toString() });
    } catch (err) {
      return res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return app;
}

export function depsFromEnv(env = loadEnv()): AppDeps {
  const adminToken = env.SELLER_ADMIN_TOKEN;
  const ledger = new Ledger();
  if (env.MOCK) {
    return { env, sellerAddress: '0x2222222222222222222222222222222222222222', gateway: createMockGateway('0x2222222222222222222222222222222222222222'), ledger, adminToken };
  }
  requireEnv(env, 'ARC_SELLER_ADDRESS', 'ARC_SELLER_PRIVATE_KEY');
  const facilitatorUrl = env.ARC_NETWORK === 'mainnet' ? undefined : 'https://gateway-api-testnet.circle.com';
  const gateway = createGateway({ sellerAddress: env.ARC_SELLER_ADDRESS!, facilitatorUrl, networks: 'eip155:5042002' });
  const gatewayClient = new GatewayClient({ chain: env.ARC_NETWORK === 'mainnet' ? 'arc' : 'arcTestnet', privateKey: env.ARC_SELLER_PRIVATE_KEY! as `0x${string}` });
  return { env, sellerAddress: env.ARC_SELLER_ADDRESS!, gateway, ledger, gatewayClient, adminToken };
}

const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMain) {
  const env = loadEnv();
  const deps = depsFromEnv(env);
  const app = createApp(deps);
  app.listen(env.PROVIDER_ARC_PORT, () => {
    console.log(`provider-arc on http://localhost:${env.PROVIDER_ARC_PORT}  sellerAddress=${deps.sellerAddress}  mock=${env.MOCK}`);
    for (const r of CATALOG) console.log(`  ${r.method} ${r.path}  $${r.priceUsd}`);
  });
}
