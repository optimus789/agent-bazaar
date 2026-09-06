import 'dotenv/config';
import { createHash } from 'node:crypto';
import express, { type Express, type Request, type Response } from 'express';
import { paymentMiddleware } from '@x402/express';
import type { RouteConfig, RoutesConfig, x402ResourceServer } from '@x402/core/server';
import { HEDERA_X402_NETWORK_TESTNET, jsonlLogger, loadEnv, requireEnv, type BriefMetrics, type Env } from '@bazaar/shared';
import { fixtureClient, graphClientFromEnv, listAgents, MESSARI_DEX_SUBGRAPHS, poolMetrics, type GraphClient } from '@bazaar/graph';
import { CATALOG, catalogPriceString, PRICES } from './catalog.js';
import { buildBrief, type Narrator } from './briefs.js';
import { createResourceServer, MockFacilitatorClient } from './x402.js';
import { HcsReceiptSink, JsonlReceiptSink, mirrorTopicUrl, type ReceiptSink } from './hcs.js';

export interface AppDeps {
  env: Env;
  payTo: string;
  resourceServer: x402ResourceServer;
  graph: GraphClient;
  receipts: ReceiptSink;
  narrator?: Narrator;
  /** skip the facilitator /supported sync at boot (tests) */
  syncFacilitator?: boolean;
  /** defaults to jsonlLogger('provider-hedera'); tests should inject an isolated logger */
  log?: ReturnType<typeof jsonlLogger>;
}

function routesConfig(payTo: string): Record<string, RouteConfig> {
  const cfg: Record<string, RouteConfig> = {};
  for (const r of CATALOG) {
    cfg[`${r.method} ${r.path}`] = {
      accepts: [{ scheme: 'exact', price: r.altPrice ?? catalogPriceString(r), network: HEDERA_X402_NETWORK_TESTNET, payTo }],
      description: r.description,
      mimeType: 'application/json',
    };
  }
  return cfg;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  const log = deps.log ?? jsonlLogger('provider-hedera');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      service: 'agent-bazaar/provider-hedera',
      chain: HEDERA_X402_NETWORK_TESTNET,
      payTo: deps.payTo,
      facilitator: deps.env.X402_TESTNET_FACILITATOR_URL,
      topicId: deps.receipts.topicId,
      mirror: deps.receipts.topicId.startsWith('0.0.') ? mirrorTopicUrl(deps.receipts.topicId) : undefined,
      mock: deps.env.MOCK,
    });
  });

  app.get('/catalog', (_req, res) => {
    res.json({ provider: 'Bazaar Market Intel (Hedera)', rail: 'hedera', network: HEDERA_X402_NETWORK_TESTNET, payTo: deps.payTo, routes: CATALOG });
  });

  // Everything under /v1 is paid. Payment is verified before any handler runs.
  app.use(paymentMiddleware(routesConfig(deps.payTo) as RoutesConfig, deps.resourceServer, undefined, undefined, deps.syncFacilitator ?? true));

  const withReceipt = (route: string, usage: Record<string, number>, bodyHash: string) => async (res: Response) => {
    // @x402/express sets PAYMENT-RESPONSE with the settlement; mirror it to HCS.
    const settlement = res.getHeader('PAYMENT-RESPONSE') ?? res.getHeader('X-PAYMENT-RESPONSE');
    let txId = 'unknown';
    let payer: string | undefined;
    let amount = '?';
    let asset = '?';
    try {
      if (typeof settlement === 'string') {
        const parsed = JSON.parse(Buffer.from(settlement, 'base64').toString('utf8')) as { transaction?: string; payer?: string };
        txId = parsed.transaction ?? txId;
        payer = parsed.payer;
      }
      const cfg = routesConfig(deps.payTo)[route];
      const accept = Array.isArray(cfg?.accepts) ? cfg?.accepts[0] : cfg?.accepts;
      if (accept) {
        amount = typeof accept.price === 'string' ? accept.price : JSON.stringify(accept.price);
        asset = typeof accept.price === 'string' ? 'USDC' : (accept.price as { asset: string }).asset;
      }
    } catch {
      /* best effort */
    }
    const rc = await deps.receipts.publish({ route, payer, amount, asset, network: HEDERA_X402_NETWORK_TESTNET, txId, briefHash: bodyHash, usage });
    // amount/asset are logged locally even though the receipt of record lives
    // on the real HCS topic in live mode (HcsReceiptSink writes on-chain, not
    // to a local file) — the dashboard needs a fast local source for the
    // payments page and reads this file, not the mirror node, per request.
    await log.write({ kind: 'paid.request', route, txId, amount, asset, payer, ...rc, usage });
  };

  async function poolBriefHandler(req: Request, res: Response, deep: boolean) {
    const { poolId, chain = 'base' } = (req.body ?? {}) as { poolId?: string; chain?: string };
    if (!poolId) return res.status(400).json({ error: 'poolId required' });
    const subgraphId = MESSARI_DEX_SUBGRAPHS[`uniswap-v3-${chain}`];
    if (!subgraphId) return res.status(400).json({ error: `unsupported chain ${chain}` });
    const t0 = Date.now();
    try {
      const { pool, metrics } = await poolMetrics(deps.graph, subgraphId, poolId, deep ? 31 : 8);
      const brief = await buildBrief(`${pool.name} on ${chain}`, metrics as BriefMetrics, deps.narrator);
      const usage = { graphQueries: 1, llmTokens: Math.round(brief.summary.length / 4), ms: Date.now() - t0 };
      const bodyHash = createHash('sha256').update(JSON.stringify(brief)).digest('hex');
      res.setHeader('X-Bazaar-Usage', JSON.stringify(usage));
      res.on('finish', () => void withReceipt(`${req.method} ${req.path}`, usage, bodyHash)(res));
      return res.json({ brief, pool, usage, priceUsd: deep ? PRICES.poolBriefDeep : PRICES.poolBrief });
    } catch (err) {
      return res.status(502).json({ error: 'upstream data error', detail: err instanceof Error ? err.message : String(err) });
    }
  }

  app.post('/v1/usdc/brief/pool', (req, res) => void poolBriefHandler(req, res, false));
  app.post('/v1/hbar/brief/pool', (req, res) => void poolBriefHandler(req, res, false));
  app.post('/v1/usdc/brief/pool/deep', (req, res) => void poolBriefHandler(req, res, true));

  app.post('/v1/usdc/lookup/agent', async (req, res) => {
    const { chain, agentId } = (req.body ?? {}) as { chain?: 'base-sepolia' | 'eth-sepolia'; agentId?: string };
    if (!chain || !agentId) return res.status(400).json({ error: 'chain and agentId required' });
    const listings = await listAgents(deps.graph, { chains: [chain], x402Only: false });
    const hit = listings.find((l) => l.agentId === String(agentId));
    if (!hit) return res.status(404).json({ error: 'agent not found in Agent0 subgraph' });
    const usage = { graphQueries: 1, llmTokens: 0 };
    res.setHeader('X-Bazaar-Usage', JSON.stringify(usage));
    res.on('finish', () => void withReceipt(`${req.method} ${req.path}`, usage, '')(res));
    return res.json({ agent: hit, verdict: hit.avgScore === undefined ? 'unrated' : hit.avgScore >= 70 ? 'trusted' : hit.avgScore >= 40 ? 'mixed' : 'avoid' });
  });

  return app;
}

/** Wire real or mock dependencies from the environment. */
export async function depsFromEnv(env = loadEnv()): Promise<AppDeps> {
  if (env.MOCK) {
    const resourceServer = createResourceServer(new MockFacilitatorClient());
    await resourceServer.initialize();
    return { env, payTo: '0.0.5000001', resourceServer, graph: fixtureClient(), receipts: new JsonlReceiptSink(), syncFacilitator: false };
  }
  requireEnv(env, 'HEDERA_PROVIDER_ACCOUNT_ID', 'HEDERA_PROVIDER_PRIVATE_KEY');
  const receipts = await HcsReceiptSink.connect({
    accountId: env.HEDERA_PROVIDER_ACCOUNT_ID!,
    privateKey: env.HEDERA_PROVIDER_PRIVATE_KEY!,
    topicId: env.HCS_RECEIPT_TOPIC_ID || undefined,
  });
  const resourceServer = createResourceServer(env.X402_TESTNET_FACILITATOR_URL);
  await resourceServer.initialize(); // fetches /supported from Blocky402; fails fast if hedera:testnet is missing
  return { env, payTo: env.HEDERA_PROVIDER_ACCOUNT_ID!, resourceServer, graph: graphClientFromEnv(env), receipts, syncFacilitator: false };
}

const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMain) {
  const env = loadEnv();
  const deps = await depsFromEnv(env);
  const app = createApp(deps);
  // Railway/Render/Fly and most PaaS hosts assign the listen port via $PORT;
  // fall back to PROVIDER_HEDERA_PORT for local dev where nothing sets it.
  const port = process.env.PORT ? Number(process.env.PORT) : env.PROVIDER_HEDERA_PORT;
  app.listen(port, () => {
    console.log(`provider-hedera on http://localhost:${port}  payTo=${deps.payTo}  facilitator=${env.X402_TESTNET_FACILITATOR_URL}  mock=${env.MOCK}`);
    for (const r of CATALOG) console.log(`  ${r.method} ${r.path}  $${r.priceUsd}`);
  });
}
