/**
 * One-off generator for the two committed registration files in registrations/.
 * Native ids are placeholders — WP00's real account/address will replace them
 * before the on-chain `register` call (the tokenURI must match what's actually
 * registered, so re-run `identity register` with the real values, not this script,
 * once accounts exist; this just seeds the repo with a reviewable example).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRegistrationFile } from '../src/registrationFile.js';
import { computeAid } from '../src/uaid.js';

const outDir = resolve(import.meta.dirname, '../../../registrations');

const hederaNativeId = 'hedera:testnet:0.0.PROVIDER_ACCOUNT_ID';
const { uaid: hederaUaid } = computeAid(
  { registry: 'bazaar', name: 'Bazaar Market Intel (Hedera)', version: '1.0.0', protocol: 'x402', nativeId: hederaNativeId, skills: [] },
  { registry: 'bazaar', proto: 'x402', nativeId: hederaNativeId },
);
const hederaFile = buildRegistrationFile({
  name: 'Bazaar Market Intel (Hedera)',
  rail: 'hedera',
  baseUrl: 'http://localhost:4021',
  routes: [
    { method: 'POST', path: '/v1/usdc/brief/pool', priceUsd: 0.002, description: 'Pool risk brief, paid in USDC' },
    { method: 'POST', path: '/v1/hbar/brief/pool', priceUsd: 0.002, description: 'Pool risk brief, paid in HBAR' },
    { method: 'POST', path: '/v1/usdc/brief/pool/deep', priceUsd: 0.01, description: 'Deep 30-day brief' },
    { method: 'POST', path: '/v1/usdc/lookup/agent', priceUsd: 0.0005, description: 'ERC-8004 reputation lookup' },
  ],
  registrations: [],
  did: hederaUaid,
});
writeFileSync(resolve(outDir, 'provider-hedera.json'), JSON.stringify(hederaFile, null, 2) + '\n');
console.log(`wrote registrations/provider-hedera.json, did=${hederaUaid}`);

const arcNativeId = 'eip155:5042002:0xPROVIDER_ADDRESS';
const { uaid: arcUaid } = computeAid(
  { registry: 'bazaar', name: 'Bazaar Task Runner (Arc)', version: '1.0.0', protocol: 'x402', nativeId: arcNativeId, skills: [] },
  { registry: 'bazaar', proto: 'x402', nativeId: arcNativeId },
);
const arcFile = buildRegistrationFile({
  name: 'Bazaar Task Runner (Arc)',
  rail: 'arc',
  baseUrl: 'http://localhost:4022',
  routes: [
    { method: 'POST', path: '/v1/task/summarise', priceUsd: 0.001, description: 'Summarise text' },
    { method: 'POST', path: '/v1/task/classify-risk', priceUsd: 0.0005, description: 'Classify a brief from another provider' },
  ],
  registrations: [],
  did: arcUaid,
});
writeFileSync(resolve(outDir, 'provider-arc.json'), JSON.stringify(arcFile, null, 2) + '\n');
console.log(`wrote registrations/provider-arc.json, did=${arcUaid}`);
