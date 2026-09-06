/** Dashboard-local config. Never import GRAPH_API_KEY into a client component. */
export const PROVIDER_HEDERA_URL = process.env.PROVIDER_HEDERA_URL ?? 'http://localhost:4021';
export const PROVIDER_ARC_URL = process.env.PROVIDER_ARC_URL ?? 'http://localhost:4022';
export const SELLER_ADMIN_TOKEN = process.env.SELLER_ADMIN_TOKEN ?? 'change-me';
export const GRAPH_API_KEY = process.env.GRAPH_API_KEY;
export const MOCK = process.env.MOCK === '1' || process.env.MOCK === 'true';
