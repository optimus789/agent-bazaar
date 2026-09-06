#!/usr/bin/env tsx
import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { baseSepolia, sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { HEDERA_TESTNET, loadEnv, requireEnv, type ChainKey } from '@bazaar/shared';
import { computeAid } from './uaid.js';
import { buildRegistrationFile } from './registrationFile.js';
import { registerAgent } from './register.js';
import { giveFeedback } from './feedback.js';

/**
 * identity register --chain base-sepolia|hedera-testnet|eth-sepolia --name <provider name> --rail hedera|arc --base-url <url>
 * identity feedback  --chain base-sepolia --agent-id <id> --score <0-100> --tag1 <tag>
 */

function arg(flag: string, argv: string[]): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function chainFor(key: ChainKey) {
  switch (key) {
    case 'base-sepolia':
      return baseSepolia;
    case 'eth-sepolia':
      return sepolia;
    case 'hedera-testnet':
      return HEDERA_TESTNET;
    case 'arc-testnet':
      throw new Error('arc-testnet has no ERC-8004 deployment; use base-sepolia or hedera-testnet');
  }
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const env = loadEnv();

  if (cmd === 'register') {
    const chainKey = (arg('--chain', rest) ?? 'base-sepolia') as ChainKey;
    const name = arg('--name', rest);
    const rail = arg('--rail', rest) as 'hedera' | 'arc' | undefined;
    const baseUrl = arg('--base-url', rest);
    if (!name || !rail || !baseUrl) throw new Error('usage: identity register --chain <chainKey> --name <name> --rail <hedera|arc> --base-url <url>');

    const chain = chainFor(chainKey);
    const isHederaChain = chainKey === 'hedera-testnet';
    requireEnv(env, isHederaChain ? 'EVM_PROVIDER_PRIVATE_KEY' : 'EVM_PROVIDER_PRIVATE_KEY');
    const privateKey = env.EVM_PROVIDER_PRIVATE_KEY! as `0x${string}`;

    const nativeId = isHederaChain
      ? `hedera:testnet:${env.HEDERA_PROVIDER_ACCOUNT_ID ?? '0.0.0'}`
      : `eip155:${chain.id}:${privateKeyToAccount(privateKey).address}`;
    const { uaid } = computeAid(
      { registry: 'bazaar', name, version: '1.0.0', protocol: 'x402', nativeId, skills: [] },
      { registry: 'bazaar', proto: 'x402', nativeId },
    );

    const file = buildRegistrationFile({ name, rail, baseUrl, routes: [], registrations: [], did: uaid });
    const outPath = resolve('registrations', `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${chainKey}.json`);
    await mkdir(resolve('registrations'), { recursive: true });
    await writeFile(outPath, JSON.stringify(file, null, 2));
    console.log(`wrote ${outPath} — host it at a public URL and pass that URL as tokenUri`);

    const tokenUri = arg('--token-uri', rest) ?? `file://${outPath}`;
    const identity = await registerAgent({ name, chain, chainKey, privateKey, tokenUri, gas: isHederaChain ? 300_000n : undefined });
    console.log(JSON.stringify(identity, null, 2));
    return;
  }

  if (cmd === 'feedback') {
    const chainKey = (arg('--chain', rest) ?? 'base-sepolia') as ChainKey;
    const agentId = arg('--agent-id', rest);
    const score = Number(arg('--score', rest));
    const tag1 = arg('--tag1', rest) ?? 'purchase';
    if (!agentId || Number.isNaN(score)) throw new Error('usage: identity feedback --chain <chainKey> --agent-id <id> --score <0-100> [--tag1 <tag>]');
    requireEnv(env, 'EVM_BUYER_PRIVATE_KEY');
    const chain = chainFor(chainKey);
    const { txHash } = await giveFeedback({ chain, privateKey: env.EVM_BUYER_PRIVATE_KEY! as `0x${string}`, agentId, score0to100: score, tag1 });
    console.log(`feedback tx: ${txHash}`);
    return;
  }

  console.error('usage: identity register|feedback ...');
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
