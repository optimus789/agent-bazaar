import { describe, expect, it } from 'vitest';
import { CATALOG, catalogPriceString, findRoute } from '../src/catalog.js';

describe('catalog', () => {
  it('has unique method+path pairs and positive prices', () => {
    const keys = CATALOG.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of CATALOG) expect(r.priceUsd).toBeGreaterThan(0);
  });
  it('quotes the HBAR route in tinybars', () => {
    const r = findRoute('POST', '/v1/hbar/brief/pool');
    expect(r?.altPrice).toEqual({ asset: '0.0.0', amount: '2000000' });
    expect(catalogPriceString(r!)).toBe('$0.002');
  });
});
