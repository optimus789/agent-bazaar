import { z } from 'zod';
import type { CatalogRoute, Rail } from '@bazaar/shared';
import { registryRef } from '@bazaar/shared';

/**
 * Shape ERC-8004 + Agent0 expect (see thegraph.com/docs Agent0 page): top-level
 * x402Support/mcpEndpoint/a2aEndpoint/ens/did are parsed directly by the subgraph,
 * so they are duplicated at the top level even though `services` also carries them.
 */
export const RegistrationServiceSchema = z.object({
  name: z.string(),
  endpoint: z.string().url(),
});

export const RegistrationFileSchema = z.object({
  type: z.literal('AgentCard').default('AgentCard'),
  name: z.string().min(1),
  description: z.string().min(1),
  image: z.string().url().nullable().default(null),
  services: z.array(RegistrationServiceSchema),
  registrations: z.array(z.object({ agentRegistry: z.string(), agentId: z.string() })),
  supportedTrust: z.array(z.string()),
  x402Support: z.boolean(),
  mcpEndpoint: z.string().url().nullable().default(null),
  a2aEndpoint: z.string().url().nullable().default(null),
  ens: z.string().nullable().default(null),
  did: z.string().nullable().default(null),
});

export type RegistrationFile = z.infer<typeof RegistrationFileSchema>;

export interface BuildRegistrationFileInput {
  name: string;
  rail: Rail;
  baseUrl: string;
  routes: CatalogRoute[];
  /** [{ chainId, address, agentId }] — omit entries not yet registered on that chain */
  registrations: { chainId: number; agentId: string; registryAddress?: `0x${string}` }[];
  did?: string;
  ens?: string;
  mcpEndpoint?: string;
}

/**
 * Bazaar convention (documented in packages/graph/src/agent0.ts `parseDescription`):
 * the description embeds `| rail: <rail> | catalog: <url>` so discovery can recover
 * the payment rail and catalog location from the Agent0 schema's plain description
 * field alone, without needing a schema change upstream.
 */
export function buildDescription(rail: Rail, baseUrl: string, routes: CatalogRoute[]): string {
  const summary = routes.length ? `Sells ${routes.length} paid endpoint${routes.length === 1 ? '' : 's'} via x402.` : 'No paid endpoints yet.';
  return `${summary} | rail: ${rail} | catalog: ${baseUrl}/catalog`;
}

export function buildRegistrationFile(input: BuildRegistrationFileInput): RegistrationFile {
  const description = buildDescription(input.rail, input.baseUrl, input.routes);
  const services: RegistrationFile['services'] = [{ name: 'x402', endpoint: `${input.baseUrl}/catalog` }, { name: 'A2A', endpoint: input.baseUrl }];
  if (input.mcpEndpoint) services.push({ name: 'MCP', endpoint: input.mcpEndpoint });

  return RegistrationFileSchema.parse({
    type: 'AgentCard',
    name: input.name,
    description,
    image: null,
    services,
    registrations: input.registrations.map((r) => ({ agentRegistry: registryRef(r.chainId, r.registryAddress), agentId: r.agentId })),
    supportedTrust: ['reputation'],
    x402Support: input.routes.length > 0,
    mcpEndpoint: input.mcpEndpoint ?? null,
    a2aEndpoint: input.baseUrl,
    ens: input.ens ?? null,
    did: input.did ?? null,
  });
}
