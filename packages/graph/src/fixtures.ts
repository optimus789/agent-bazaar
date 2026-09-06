import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT0_SUBGRAPHS } from '@bazaar/shared';
import { MockGraphClient } from './client.js';
import { MESSARI_DEX_SUBGRAPHS } from './messari.js';

const here = dirname(fileURLToPath(import.meta.url));

function load(name: string): unknown {
  return JSON.parse(readFileSync(resolve(here, '../fixtures', name), 'utf8'));
}

/** A MockGraphClient wired to the checked-in fixtures. Synthetic until `record-fixtures` overwrites them. */
export function fixtureClient(): MockGraphClient {
  return new MockGraphClient((subgraphId, document, variables) => {
    if (subgraphId === AGENT0_SUBGRAPHS['base-sepolia']) {
      const all = load('agents.base-sepolia.json') as { agents: { id: string }[] };
      if (/query BazaarAgent\(/.test(document)) return { agent: all.agents.find((a) => a.id === variables?.id) ?? null };
      return all;
    }
    if (subgraphId === AGENT0_SUBGRAPHS['eth-sepolia']) return load('agents.eth-sepolia.json');
    if (subgraphId === MESSARI_DEX_SUBGRAPHS['uniswap-v3-base']) {
      if (/BazaarTopPools/.test(document)) return load('pools.base.json');
      if (/BazaarPoolSnapshots/.test(document)) return load('pool-snapshots.base.json');
    }
    throw new Error(`no fixture for ${subgraphId}`);
  });
}
