import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { jsonlLogger, loadEnv } from '@bazaar/shared';
import { fixtureClient } from '@bazaar/graph';
import { createApp } from '../src/server.js';
import { createResourceServer, MockFacilitatorClient } from '../src/x402.js';
import { JsonlReceiptSink } from '../src/hcs.js';

// Isolated tmpdir per test — JsonlReceiptSink and createApp's log both default
// to the real repo-wide data/ dir, which would otherwise be polluted with
// test payments (none of the current tests pay, but future ones might).
let dataDir: string;

async function app() {
  const env = loadEnv({ MOCK: '1' });
  const resourceServer = createResourceServer(new MockFacilitatorClient());
  await resourceServer.initialize();
  return createApp({
    env,
    payTo: '0.0.5000001',
    resourceServer,
    graph: fixtureClient(),
    receipts: new JsonlReceiptSink(jsonlLogger('provider-hedera-receipts', dataDir)),
    syncFacilitator: false,
    log: jsonlLogger('provider-hedera', dataDir),
  });
}

describe('provider-hedera HTTP surface', () => {
  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'provider-hedera-test-'));
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('serves health and catalog for free', async () => {
    const h = await request(await app()).get('/health');
    expect(h.status).toBe(200);
    expect(h.body.chain).toBe('hedera:testnet');
    const c = await request(await app()).get('/catalog');
    expect(c.status).toBe(200);
    expect(c.body.routes.length).toBeGreaterThan(0);
    expect(c.body.payTo).toBe('0.0.5000001');
  });

  it('answers unpaid brief requests with 402 and Hedera payment requirements', async () => {
    const res = await request(await app())
      .post('/v1/usdc/brief/pool')
      .set('accept', 'application/json')
      .send({ poolId: '0xd0b53d9277642d899df5c87a3966a349a798f224' });
    expect(res.status).toBe(402);
    const header = res.headers['payment-required'];
    const body = header ? JSON.parse(Buffer.from(String(header), 'base64').toString('utf8')) : res.body;
    const accepts = body.accepts as { network: string; payTo: string; scheme: string }[];
    expect(accepts[0]).toMatchObject({ scheme: 'exact', network: 'hedera:testnet', payTo: '0.0.5000001' });
  });

  it('does not run the brief handler before payment', async () => {
    const res = await request(await app()).post('/v1/usdc/brief/pool').send({});
    expect(res.status).toBe(402); // never reaches the 400 "poolId required"
  });
});
