import { describe, expect, it } from 'vitest';
import { GraphQueryError, StudioClient } from '../src/client.js';

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('StudioClient', () => {
  it('sends bearer auth to the Studio gateway and unwraps data', async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { data: { agents: [] } } }]);
    const c = new StudioClient('key123', fn);
    const data = await c.query<{ agents: unknown[] }>('SUBGRAPH', '{ agents { id } }');
    expect(data.agents).toEqual([]);
    expect(calls[0]!.url).toBe('https://gateway.thegraph.com/api/subgraphs/id/SUBGRAPH');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer key123');
  });
  it('retries once on 5xx then succeeds', async () => {
    const { fn, calls } = fakeFetch([{ status: 502, body: {} }, { status: 200, body: { data: { ok: 1 } } }]);
    const c = new StudioClient('k', fn);
    expect(await c.query('S', '{ ok }')).toEqual({ ok: 1 });
    expect(calls).toHaveLength(2);
  });
  it('surfaces GraphQL errors', async () => {
    const { fn } = fakeFetch([{ status: 200, body: { errors: [{ message: 'bad field' }] } }]);
    await expect(new StudioClient('k', fn).query('S', '{ nope }')).rejects.toBeInstanceOf(GraphQueryError);
  });
  it('requires a key', () => {
    expect(() => new StudioClient('')).toThrow();
  });
});
