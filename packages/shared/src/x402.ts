/** x402 constants and price helpers shared by providers and the buyer. */

export const BLOCKY402_TESTNET = 'https://api.testnet.blocky402.com';
export const BLOCKY402_MAINNET = 'https://api.blocky402.com';
/** Blocky402's Hedera fee-payer account as returned by /supported on 2026-09-06. */
export const BLOCKY402_TESTNET_FEE_PAYER = '0.0.7162784';

export const HEDERA_X402_NETWORK_TESTNET = 'hedera:testnet' as const;
export const HEDERA_X402_NETWORK_MAINNET = 'hedera:mainnet' as const;

export const HEDERA_HBAR_ASSET = '0.0.0';
export const HEDERA_USDC_TESTNET = '0.0.429274';
export const HEDERA_USDC_MAINNET = '0.0.456858';

const TINYBARS_PER_HBAR = 100_000_000;

/** A USD price string accepted by x402 middlewares, e.g. "$0.002". */
export type UsdPrice = `$${string}`;

/** Explicit Hedera asset amount (used for HBAR, which has no USD quote in the scheme). */
export interface HederaAssetAmount {
  asset: string;
  amount: string;
}

export function usdPrice(usd: number): UsdPrice {
  if (!Number.isFinite(usd) || usd < 0) throw new Error(`invalid usd price: ${usd}`);
  // x402 accepts up to 6 decimals for USDC; strip trailing zeros for readability.
  const s = usd.toFixed(6).replace(/\.?0+$/, '');
  return `$${s === '' ? '0' : s}` as UsdPrice;
}

export function hbarPrice(hbar: number): HederaAssetAmount {
  if (!Number.isFinite(hbar) || hbar <= 0) throw new Error(`invalid hbar amount: ${hbar}`);
  return { asset: HEDERA_HBAR_ASSET, amount: String(Math.round(hbar * TINYBARS_PER_HBAR)) };
}

/** Parse a "$0.002" string back to a number (for ledgers and ranking). */
export function parseUsdPrice(p: string): number {
  const m = /^\$?(\d+(?:\.\d+)?)$/.exec(p.trim());
  if (!m) throw new Error(`unparseable usd price: ${p}`);
  return Number(m[1]);
}
