import type { CatalogRoute } from '@bazaar/shared';
import { PROVIDER_ARC_URL, PROVIDER_HEDERA_URL, SELLER_ADMIN_TOKEN } from './env.js';

export interface ProviderHealth {
  service: string;
  chain: string;
  payTo?: string;
  sellerAddress?: string;
  facilitator?: string;
  topicId?: string;
  mirror?: string;
  gatewayBalanceUsd?: number;
  mock?: boolean;
}

export interface ProviderCatalog {
  provider: string;
  rail: string;
  network: string;
  payTo: string;
  routes: CatalogRoute[];
}

/** Fetch a provider's own live status. Returns null if the provider isn't reachable — the dashboard should degrade, not crash. */
export async function fetchHealth(baseUrl: string): Promise<ProviderHealth | null> {
  try {
    const res = await fetch(`${baseUrl}/health`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as ProviderHealth;
  } catch {
    return null;
  }
}

export async function fetchCatalog(baseUrl: string): Promise<ProviderCatalog | null> {
  try {
    const res = await fetch(`${baseUrl}/catalog`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as ProviderCatalog;
  } catch {
    return null;
  }
}

export interface SellerEarnings {
  ledger: { totalPayments: number; totalUsd: number; recent: { ts: string; route: string; payer?: string; amountUsd: number; network?: string; transaction?: string }[] };
  gateway?: { wallet: { formatted: string }; gateway: { total: string; available: string; withdrawing: string; withdrawable: string } } | { error: string };
}

export async function fetchSellerEarnings(baseUrl: string): Promise<SellerEarnings | null> {
  try {
    const res = await fetch(`${baseUrl}/v1/seller/earnings`, { headers: { 'x-admin-token': SELLER_ADMIN_TOKEN }, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as SellerEarnings;
  } catch {
    return null;
  }
}

export const PROVIDERS = {
  hedera: PROVIDER_HEDERA_URL,
  arc: PROVIDER_ARC_URL,
} as const;
