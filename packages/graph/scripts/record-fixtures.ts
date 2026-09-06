import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AGENT0_SUBGRAPHS, loadEnv, requireEnv } from '@bazaar/shared';
import { StudioClient } from '../src/client.js';
import { AGENTS_QUERY } from '../src/queries/agents.js';
import { TOP_POOLS_QUERY, POOL_SNAPSHOTS_QUERY } from '../src/queries/messari.js';
import { MESSARI_DEX_SUBGRAPHS } from '../src/messari.js';

const env = loadEnv();
requireEnv(env, 'GRAPH_API_KEY');
const client = new StudioClient(env.GRAPH_API_KEY!);
const out = (name: string, data: unknown) => {
  writeFileSync(resolve('fixtures', name), JSON.stringify({ _note: `recorded ${new Date().toISOString()}`, ...(data as object) }, null, 2));
  console.log(`wrote fixtures/${name}`);
};
out('agents.base-sepolia.json', await client.query(AGENT0_SUBGRAPHS['base-sepolia'], AGENTS_QUERY, { first: 50, skip: 0 }));
out('agents.eth-sepolia.json', await client.query(AGENT0_SUBGRAPHS['eth-sepolia'], AGENTS_QUERY, { first: 50, skip: 0 }));
const sg = MESSARI_DEX_SUBGRAPHS['uniswap-v3-base']!;
const pools = await client.query<{ liquidityPools: { id: string }[] }>(sg, TOP_POOLS_QUERY, { n: 10 });
out('pools.base.json', pools);
out('pool-snapshots.base.json', await client.query(sg, POOL_SNAPSHOTS_QUERY, { pool: pools.liquidityPools[0]!.id, days: 8 }));
