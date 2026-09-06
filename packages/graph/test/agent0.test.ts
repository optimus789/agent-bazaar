import { describe, expect, it } from 'vitest';
import { AGENT0_SUBGRAPHS } from '@bazaar/shared';
import { averageScore, getAgent, listAgents, parseDescription, toListing } from '../src/agent0.js';
import { fixtureClient } from '../src/fixtures.js';
import { MockGraphClient } from '../src/client.js';

describe('parseDescription', () => {
  it('extracts rail and catalog from the bazaar description convention', () => {
    expect(parseDescription('Sells briefs. | rail: hedera | catalog: http://h:4021/catalog')).toEqual({
      rail: 'hedera',
      catalogUrl: 'http://h:4021/catalog',
    });
    expect(parseDescription('plain text')).toEqual({});
    expect(parseDescription(null)).toEqual({});
  });
});

describe('averageScore', () => {
  it('normalises 0–1, 0–5 and 0–100 scales to 0–100', () => {
    expect(averageScore([{ clientAddress: 'a', value: '0.8' }])).toBeCloseTo(80);
    expect(averageScore([{ clientAddress: 'a', value: '4' }, { clientAddress: 'b', value: '5' }])).toBeCloseTo(90);
    expect(averageScore([{ clientAddress: 'a', value: '90' }])).toBe(90);
  });
  it('is undefined with no feedback', () => {
    expect(averageScore([])).toBeUndefined();
    expect(averageScore(null)).toBeUndefined();
  });
});

describe('listAgents', () => {
  it('sends the identical document to every chain and merges with provenance', async () => {
    const client = fixtureClient();
    const listings = await listAgents(client);
    expect(client.calls).toHaveLength(2);
    expect(new Set(client.calls.map((c) => c.document)).size).toBe(1);
    expect(client.calls.map((c) => c.subgraphId).sort()).toEqual(
      [AGENT0_SUBGRAPHS['base-sepolia'], AGENT0_SUBGRAPHS['eth-sepolia']].sort(),
    );
    expect(listings.map((l) => l.chain)).toEqual(expect.arrayContaining(['base-sepolia', 'eth-sepolia']));
  });
  it('drops agents without x402 by default', async () => {
    const listings = await listAgents(fixtureClient());
    expect(listings.every((l) => l.x402Support)).toBe(true);
    expect(listings.find((l) => l.name === 'Some other agent')).toBeUndefined();
    const all = await listAgents(fixtureClient(), { x402Only: false });
    expect(all.length).toBe(listings.length + 1);
  });
  it('derives rail, baseUrl, score and validations', async () => {
    const [intel] = (await listAgents(fixtureClient(), { chains: ['base-sepolia'] })).filter((l) => l.agentId === '101');
    expect(intel?.rail).toBe('hedera');
    expect(intel?.baseUrl).toBe('http://localhost:4021');
    expect(intel?.avgScore).toBe(80);
    expect(intel?.validations).toBe(1);
    expect(intel?.totalFeedback).toBe(3);
  });
});

describe('getAgent', () => {
  it('looks up by chainId:agentId', async () => {
    const a = await getAgent(fixtureClient(), 'base-sepolia', 102);
    expect(a?.name).toBe('Bazaar Task Runner (Arc)');
    expect(a?.rail).toBe('arc');
    expect(await getAgent(fixtureClient(), 'base-sepolia', 999)).toBeUndefined();
  });
});

describe('toListing', () => {
  it('falls back sensibly when registrationFile is missing', () => {
    const l = toListing({ id: '84532:1', chainId: 84532, agentId: '1', owner: '0x0' }, 'base-sepolia');
    expect(l.name).toBe('agent 1');
    expect(l.rail).toBe('graph');
    expect(l.x402Support).toBe(false);
  });
});

describe('MockGraphClient', () => {
  it('records calls', async () => {
    const c = new MockGraphClient(() => ({ ok: true }));
    await c.query('x', '{ a }', { v: 1 });
    expect(c.calls[0]).toEqual({ subgraphId: 'x', document: '{ a }', variables: { v: 1 } });
  });
});
