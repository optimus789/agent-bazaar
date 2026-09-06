import 'dotenv/config';
import { agent0SubgraphId, loadEnv, requireEnv } from '@bazaar/shared';
import { X402GraphClient } from '../src/client.js';

const env = loadEnv();
requireEnv(env, 'EVM_BUYER_PRIVATE_KEY');
const client = new X402GraphClient({ privateKey: env.EVM_BUYER_PRIVATE_KEY as `0x${string}`, env: env.X402_ENV });
const data = await client.query<{ _meta: { block: { number: number } } }>(agent0SubgraphId('base-sepolia'), '{ _meta { block { number } } }');
console.log(`paid query ok on ${env.X402_ENV}; base-sepolia Agent0 head block = ${data._meta.block.number}`);
console.log(`receipt logged to ${client['log'].file}`);
