#!/usr/bin/env tsx
import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnv, requireEnv, jsonlLoggerWithPostgres, PostgresJsonlLog } from '@bazaar/shared';
import { fixtureClient, graphClientFromEnv } from '@bazaar/graph';
import { runAgent } from './agent.js';
import { modelFromEnv } from './model.js';
import { makeHederaRail } from './rails/hedera.js';
import { makeArcRail } from './rails/arc.js';
import { makeGraphRail } from './rails/graph.js';
import { makeMockArcRail, makeMockGraphRail, makeMockHederaRail } from './mockRails.js';

const MOCK_BUYER_EVM_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001' as const;

function parseArgs(argv: string[]): { task: string; budget: number; mock: boolean } {
  const mock = argv.includes('--mock');
  const budgetIdx = argv.indexOf('--budget');
  const budget = budgetIdx >= 0 ? Number(argv[budgetIdx + 1]) : 0.05;
  const task = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--budget').join(' ');
  if (!task) throw new Error('usage: buyer "<task>" --budget <usd> [--mock|--live]');
  if (!Number.isFinite(budget) || budget <= 0) throw new Error(`invalid --budget: ${budgetIdx >= 0 ? argv[budgetIdx + 1] : undefined}`);
  return { task, budget, mock };
}

async function saveTranscript(task: string, budget: number, result: { finalText: string; ledger: unknown }) {
  const transcriptDir = resolve(process.cwd(), '../../docs/demo');
  await mkdir(transcriptDir, { recursive: true });
  const transcriptPath = resolve(transcriptDir, `transcript-${new Date().toISOString().slice(0, 10)}.md`);
  await writeFile(
    transcriptPath,
    `# Buyer agent transcript\n\n**Task:** ${task}\n**Budget:** $${budget}\n\n## Final report\n\n${result.finalText}\n\n## Ledger\n\n${JSON.stringify(result.ledger, null, 2)}\n`,
  );
  return transcriptPath;
}

async function main() {
  const { task, budget, mock } = parseArgs(process.argv.slice(2));
  const env = loadEnv(mock ? { ...process.env, MOCK: '1' } : process.env);
  const model = modelFromEnv(env);

  const graphClient = env.MOCK ? fixtureClient() : graphClientFromEnv(env);
  const hederaRail = env.MOCK ? makeMockHederaRail() : makeHederaRail({ accountId: requireHederaAccount(env), privateKeyEcdsaHex: requireHederaKey(env) });
  const arcRail = env.MOCK ? makeMockArcRail() : makeArcRail({ privateKey: requireArcKey(env), capUsd: budget });
  const graphRail = env.MOCK ? makeMockGraphRail(graphClient) : makeGraphRail({ privateKey: requireEvmKey(env), env: env.X402_ENV });
  const buyerPrivateKeyEvm = env.MOCK ? MOCK_BUYER_EVM_KEY : requireEvmKey(env);

  // Postgres-backed decision log when DATABASE_URL is set — a Railway-run
  // buyer-agent is its own container with its own disk, invisible to the
  // dashboard service's local data/buyer.jsonl; sharing one Postgres table
  // (same instance provider-arc already uses, different table) is what makes
  // a live run show up on the dashboard's /agent page. See docs/STATUS.md WP13.
  const pgLog = env.DATABASE_URL ? await PostgresJsonlLog.connect(env.DATABASE_URL) : undefined;
  const log = jsonlLoggerWithPostgres('buyer', pgLog);

  const result = await runAgent(task, { model, graphClient, hederaRail, arcRail, graphRail, buyerPrivateKeyEvm, budgetUsd: budget, log });

  console.log(result.finalText);
  console.log(`\nbudget: spent $${result.ledger.spentUsd.toFixed(6)} of $${result.ledger.budgetUsd.toFixed(6)} (${result.steps} steps)`);
  if (result.ledger.receipts.length) {
    console.log('receipts:');
    for (const r of result.ledger.receipts) console.log(`  ${r.rail} $${r.amountUsd} ${r.txId ?? ''}`);
  }

  if (!env.MOCK) {
    const path = await saveTranscript(task, budget, result);
    console.log(`\ntranscript saved to ${path}`);
  }
}

function requireHederaAccount(env: ReturnType<typeof loadEnv>): string {
  requireEnv(env, 'HEDERA_BUYER_ACCOUNT_ID');
  return env.HEDERA_BUYER_ACCOUNT_ID!;
}
function requireHederaKey(env: ReturnType<typeof loadEnv>): string {
  requireEnv(env, 'HEDERA_BUYER_PRIVATE_KEY');
  return env.HEDERA_BUYER_PRIVATE_KEY!;
}
function requireArcKey(env: ReturnType<typeof loadEnv>): `0x${string}` {
  requireEnv(env, 'ARC_BUYER_PRIVATE_KEY');
  return env.ARC_BUYER_PRIVATE_KEY as `0x${string}`;
}
function requireEvmKey(env: ReturnType<typeof loadEnv>): `0x${string}` {
  requireEnv(env, 'EVM_BUYER_PRIVATE_KEY');
  return env.EVM_BUYER_PRIVATE_KEY as `0x${string}`;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
