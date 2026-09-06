import { describe, expect, it } from 'vitest';
import { hbarPrice, parseUsdPrice, usdPrice, HEDERA_HBAR_ASSET } from '../src/x402.js';

describe('usdPrice', () => {
  it('formats sub-cent prices without trailing zeros', () => {
    expect(usdPrice(0.002)).toBe('$0.002');
    expect(usdPrice(0.0005)).toBe('$0.0005');
    expect(usdPrice(1)).toBe('$1');
    expect(usdPrice(0)).toBe('$0');
  });
  it('rejects negatives and NaN', () => {
    expect(() => usdPrice(-1)).toThrow();
    expect(() => usdPrice(Number.NaN)).toThrow();
  });
});

describe('hbarPrice', () => {
  it('converts HBAR to tinybars on the native asset', () => {
    expect(hbarPrice(0.001)).toEqual({ asset: HEDERA_HBAR_ASSET, amount: '100000' });
    expect(hbarPrice(1)).toEqual({ asset: '0.0.0', amount: '100000000' });
  });
  it('rejects zero', () => {
    expect(() => hbarPrice(0)).toThrow();
  });
});

describe('parseUsdPrice', () => {
  it('round-trips', () => {
    for (const v of [0.002, 0.01, 3]) expect(parseUsdPrice(usdPrice(v))).toBeCloseTo(v, 9);
    expect(parseUsdPrice('0.5')).toBe(0.5);
  });
  it('rejects garbage', () => {
    expect(() => parseUsdPrice('five')).toThrow();
  });
});
