import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { jsonlLogger, loadEnv } from '@bazaar/shared';
import { createApp, type AppDeps } from '../src/server.js';
import { createMockGateway } from '../src/gateway.js';
import { Ledger } from '../src/earnings.js';

const SELLER = '0x2222222222222222222222222222222222222222';

// Isolated tmpdir per test — Ledger defaults to the real repo-wide data/ dir,
// which would otherwise be polluted with test payments on every run.
let dataDir: string;

function app(): AppDeps {
  const env = loadEnv({ MOCK: '1' });
  return { env, sellerAddress: SELLER, gateway: createMockGateway(SELLER), ledger: new Ledger(jsonlLogger('provider-arc-payments', dataDir)), adminToken: 'test-admin-token' };
}

describe('provider-arc HTTP surface', () => {
  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'provider-arc-test-'));
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('serves health and catalog for free', async () => {
    const deps = app();
    const h = await request(createApp(deps)).get('/health');
    expect(h.status).toBe(200);
    expect(h.body).toMatchObject({ chain: 'arc-testnet', sellerAddress: SELLER, mock: true });
    const c = await request(createApp(deps)).get('/catalog');
    expect(c.status).toBe(200);
    expect(c.body.routes.length).toBeGreaterThan(0);
    expect(c.body.payTo).toBe(SELLER);
  });

  it('answers unpaid task requests with a Gateway-shaped 402', async () => {
    const res = await request(createApp(app())).post('/v1/task/summarise').send({ text: 'hello world' });
    expect(res.status).toBe(402);
    expect(res.body.accepts[0]).toMatchObject({ scheme: 'exact', network: 'eip155:5042002', payTo: SELLER });
  });

  it('does not run the handler before payment', async () => {
    // no text in body AND no payment — if payment ran first this would still be 402, not 400
    const res = await request(createApp(app())).post('/v1/task/summarise').send({});
    expect(res.status).toBe(402);
  });

  it('serves the task and records a ledger entry once paid (mock payment header)', async () => {
    const deps = app();
    const httpApp = createApp(deps);
    const res = await request(httpApp).post('/v1/task/summarise').set('x-payment', 'mock').send({ text: 'hello world' });
    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('hello world');
    const snapshot = deps.ledger.snapshot();
    expect(snapshot.totalPayments).toBe(1);
    expect(snapshot.totalUsd).toBeCloseTo(0.001);
    expect(snapshot.recent[0]?.route).toBe('POST /v1/task/summarise');
  });

  it('classify-risk works once paid and cross-references a brief-shaped body', async () => {
    const res = await request(createApp(app()))
      .post('/v1/task/classify-risk')
      .set('x-payment', 'mock')
      .send({ brief: { riskScore: 85, reasons: ['thin liquidity'] } });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('high');
  });

  it('seller routes require the admin token', async () => {
    const res = await request(createApp(app())).get('/v1/seller/earnings');
    expect(res.status).toBe(403);
    const ok = await request(createApp(app())).get('/v1/seller/earnings').set('x-admin-token', 'test-admin-token');
    expect(ok.status).toBe(200);
    expect(ok.body.ledger.totalPayments).toBe(0);
  });

  it('withdraw fails cleanly in MOCK mode (no live GatewayClient)', async () => {
    const res = await request(createApp(app())).post('/v1/seller/withdraw').set('x-admin-token', 'test-admin-token').send({ amount: '1.00' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no live GatewayClient/);
  });
});
