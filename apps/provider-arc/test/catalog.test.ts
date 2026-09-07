import { describe, expect, it } from 'vitest';
import { CATALOG, catalogPriceString, findRoute } from '../src/catalog.js';

describe('catalog', () => {
  it('has unique method+path pairs and positive prices', () => {
    const keys = CATALOG.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of CATALOG) expect(r.priceUsd).toBeGreaterThan(0);
  });
  it('quotes prices as $-strings', () => {
    const r = findRoute('POST', '/v1/task/summarise');
    expect(catalogPriceString(r!)).toBe('$1');
  });
  it('findRoute returns undefined for unknown routes', () => {
    expect(findRoute('GET', '/nope')).toBeUndefined();
  });
});
