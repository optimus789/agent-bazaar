import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === '1' || v === 'true');

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/).optional();
const hederaId = z.string().regex(/^0\.0\.\d+$/).optional();

export const EnvSchema = z.object({
  MOCK: bool,
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('claude-sonnet-5'),
  LLM_BASE_URL: z.string().url().optional().or(z.literal('')),

  GRAPH_API_KEY: z.string().optional(),
  X402_ENV: z.enum(['testnet', 'production']).default('testnet'),
  EVM_BUYER_PRIVATE_KEY: hex,
  EVM_PROVIDER_PRIVATE_KEY: hex,

  HEDERA_BUYER_ACCOUNT_ID: hederaId,
  HEDERA_BUYER_PRIVATE_KEY: hex,
  HEDERA_PROVIDER_ACCOUNT_ID: hederaId,
  HEDERA_PROVIDER_PRIVATE_KEY: hex,
  X402_TESTNET_FACILITATOR_URL: z.string().url().default('https://api.testnet.blocky402.com'),
  HCS_RECEIPT_TOPIC_ID: hederaId.or(z.literal('')),

  ARC_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  ARC_SELLER_ADDRESS: hex,
  ARC_SELLER_PRIVATE_KEY: hex,
  ARC_BUYER_PRIVATE_KEY: hex,
  SELLER_ADMIN_TOKEN: z.string().default('change-me'),

  PROVIDER_HEDERA_PORT: z.coerce.number().default(4021),
  PROVIDER_ARC_PORT: z.coerce.number().default(4022),
  DASHBOARD_PORT: z.coerce.number().default(3000),

  /** Optional. When set, provider-arc persists its payment ledger to Postgres
   * instead of only in-memory, so it survives a redeploy on PaaS hosts with
   * ephemeral container disks (see docs/STATUS.md WP12 — the reference Arc
   * Nanopayments app does the same with Supabase/Postgres for the same
   * reason: Circle's own API has no payment-history endpoint to fall back on). */
  DATABASE_URL: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** Parse env once. Pass `process.env` in apps; pass a plain object in tests. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`invalid environment: ${issues}`);
  }
  return parsed.data;
}

/** Throw a readable error when a required key for a live run is missing. */
export function requireEnv<K extends keyof Env>(env: Env, ...keys: K[]): void {
  const missing = keys.filter((k) => env[k] === undefined || env[k] === '');
  if (missing.length) throw new Error(`missing env for live run: ${missing.join(', ')} (set MOCK=1 to run offline)`);
}
