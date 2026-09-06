import { agent0SubgraphId, CHAIN_IDS, type Agent0Chain, type ProviderListing, type Rail } from '@bazaar/shared';
import type { GraphClient } from './client.js';
import { AGENTS_QUERY, AGENT_QUERY } from './queries/agents.js';

export interface RawFeedback {
  tag1?: string | null;
  tag2?: string | null;
  clientAddress: string;
  /** The subgraph's `value` field is a `BigDecimal` — already decimal-normalised at index time, no separate valueDecimals field exists. */
  value?: string | number | null;
}

export interface RawAgent {
  id: string;
  chainId: string | number;
  agentId: string;
  owner: string;
  createdAt?: string;
  totalFeedback?: string | number | null;
  registrationFile?: {
    name?: string | null;
    description?: string | null;
    image?: string | null;
    mcpEndpoint?: string | null;
    a2aEndpoint?: string | null;
    supportedTrusts?: string[] | null;
    x402Support?: boolean | null;
    ens?: string | null;
    did?: string | null;
  } | null;
  feedback?: RawFeedback[] | null;
  validations?: { status?: string | null }[] | null;
}

/**
 * Bazaar providers encode their rail and catalog in the description so that the
 * standard Agent0 fields are enough for discovery:
 *   "…free text… | rail: hedera | catalog: https://host/catalog"
 */
const RAIL_RE = /rail:\s*(hedera|arc|graph)/i;
const CATALOG_RE = /catalog:\s*(https?:\/\/\S+)/i;

export function parseDescription(desc: string | null | undefined): { rail?: Rail; catalogUrl?: string } {
  if (!desc) return {};
  const rail = RAIL_RE.exec(desc)?.[1]?.toLowerCase() as Rail | undefined;
  const catalogUrl = CATALOG_RE.exec(desc)?.[1]?.replace(/[)\]]+$/, '');
  return { rail, catalogUrl };
}

/** Average of feedback values normalised to 0–100. Undefined when there is none. */
export function averageScore(feedback: RawFeedback[] | null | undefined): number | undefined {
  if (!feedback?.length) return undefined;
  const vals = feedback
    .map((f) => {
      if (f.value === null || f.value === undefined) return undefined;
      const v = Number(f.value);
      return Number.isFinite(v) ? v : undefined;
    })
    .filter((v): v is number => v !== undefined);
  if (!vals.length) return undefined;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  // Feedback may be 0–1, 0–5 or 0–100 depending on the client; normalise to 0–100.
  const scaled = avg <= 1 ? avg * 100 : avg <= 5 ? avg * 20 : avg;
  return Math.max(0, Math.min(100, scaled));
}

export function toListing(raw: RawAgent, chain: Agent0Chain): ProviderListing {
  const rf = raw.registrationFile ?? {};
  const { rail, catalogUrl } = parseDescription(rf.description);
  const baseUrl = rf.a2aEndpoint ?? (catalogUrl ? catalogUrl.replace(/\/catalog\/?$/, '') : '');
  return {
    id: raw.id,
    chain,
    agentId: String(raw.agentId),
    owner: raw.owner,
    name: rf.name ?? `agent ${raw.agentId}`,
    description: rf.description ?? '',
    rail: rail ?? 'graph',
    baseUrl,
    routes: [],
    x402Support: Boolean(rf.x402Support),
    totalFeedback: Number(raw.totalFeedback ?? raw.feedback?.length ?? 0),
    avgScore: averageScore(raw.feedback),
    validations: raw.validations?.filter((v) => v.status && /valid|success|approved|passed/i.test(v.status)).length ?? 0,
  };
}

export interface ListAgentsOptions {
  chains?: Agent0Chain[];
  first?: number;
  /** keep only agents that advertise x402 (default true) */
  x402Only?: boolean;
}

/** Run the same document on every requested chain and merge, preserving chain provenance. */
export async function listAgents(client: GraphClient, opts: ListAgentsOptions = {}): Promise<ProviderListing[]> {
  const chains = opts.chains ?? (['base-sepolia', 'eth-sepolia'] as Agent0Chain[]);
  const first = opts.first ?? 100;
  const x402Only = opts.x402Only ?? true;
  const results = await Promise.all(
    chains.map(async (chain) => {
      const data = await client.query<{ agents: RawAgent[] }>(agent0SubgraphId(chain), AGENTS_QUERY, { first, skip: 0 });
      return data.agents.map((a) => toListing(a, chain));
    }),
  );
  const merged = results.flat();
  return x402Only ? merged.filter((l) => l.x402Support) : merged;
}

export async function getAgent(client: GraphClient, chain: Agent0Chain, agentId: string | number): Promise<ProviderListing | undefined> {
  const id = `${CHAIN_IDS[chain]}:${agentId}`;
  const data = await client.query<{ agent: RawAgent | null }>(agent0SubgraphId(chain), AGENT_QUERY, { id });
  return data.agent ? toListing(data.agent, chain) : undefined;
}
