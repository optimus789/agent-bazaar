import 'dotenv/config';
import { loadEnv } from '@bazaar/shared';
import { graphClientFromEnv, listAgents } from '../src/index.js';

const env = loadEnv();
const client = graphClientFromEnv(env);
console.log(`mode=${client.mode}`);
const listings = await listAgents(client, { x402Only: false, first: 25 });
console.table(listings.map((l) => ({ chain: l.chain, id: l.id, name: l.name, rail: l.rail, x402: l.x402Support, fb: l.totalFeedback, score: l.avgScore ?? '-' })));
