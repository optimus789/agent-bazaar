import { createGraphQuery } from '@graphprotocol/client-x402';
import { GRAPH_X402_PRICE_USD, jsonlLogger, studioUrl, x402PaymentChain, x402Url, type X402Env } from '@bazaar/shared';

export interface GraphQLResult<T> {
  data?: T;
  errors?: { message: string }[];
}

/** Anything that can run a GraphQL document against a subgraph id. */
export interface GraphClient {
  readonly mode: 'studio' | 'x402' | 'mock';
  query<T = unknown>(subgraphId: string, document: string, variables?: Record<string, unknown>): Promise<T>;
}

export class GraphQueryError extends Error {
  constructor(message: string, public readonly subgraphId: string, public readonly errors?: { message: string }[]) {
    super(message);
    this.name = 'GraphQueryError';
  }
}

function unwrap<T>(res: GraphQLResult<T>, subgraphId: string): T {
  if (res.errors?.length) {
    throw new GraphQueryError(res.errors.map((e) => e.message).join('; '), subgraphId, res.errors);
  }
  if (res.data === undefined) throw new GraphQueryError('empty response', subgraphId);
  return res.data;
}

/** Subgraph Studio gateway: `Authorization: Bearer <api key>`. Retries once on 5xx. */
export class StudioClient implements GraphClient {
  readonly mode = 'studio' as const;
  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {
    if (!apiKey) throw new Error('StudioClient needs a Subgraph Studio API key');
  }

  async query<T = unknown>(subgraphId: string, document: string, variables: Record<string, unknown> = {}): Promise<T> {
    const body = JSON.stringify({ query: document, variables });
    const url = studioUrl(subgraphId);
    let last: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      last = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body,
      });
      if (last.status < 500) break;
    }
    if (!last) throw new GraphQueryError('no response', subgraphId);
    if (!last.ok) throw new GraphQueryError(`HTTP ${last.status} from gateway`, subgraphId);
    return unwrap((await last.json()) as GraphQLResult<T>, subgraphId);
  }
}

export interface X402ClientOptions {
  privateKey: `0x${string}`;
  env?: X402Env;
  /** where to append paid-query events; defaults to data/graph-x402.jsonl */
  log?: ReturnType<typeof jsonlLogger>;
}

/**
 * Pay-per-query gateway client. No API key: each request is answered with 402,
 * the client signs a USDC permit on Base (Sepolia on testnet) and retries.
 */
export class X402GraphClient implements GraphClient {
  readonly mode = 'x402' as const;
  private readonly env: X402Env;
  private readonly runners = new Map<string, ReturnType<typeof createGraphQuery>>();
  private readonly log: ReturnType<typeof jsonlLogger>;
  private readonly privateKey: `0x${string}`;

  constructor(opts: X402ClientOptions) {
    this.privateKey = opts.privateKey;
    this.env = opts.env ?? 'testnet';
    this.log = opts.log ?? jsonlLogger('graph-x402');
  }

  private runner(subgraphId: string) {
    let r = this.runners.get(subgraphId);
    if (!r) {
      r = createGraphQuery({ endpoint: x402Url(subgraphId, this.env), chain: x402PaymentChain(this.env), privateKey: this.privateKey });
      this.runners.set(subgraphId, r);
    }
    return r;
  }

  async query<T = unknown>(subgraphId: string, document: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await this.runner(subgraphId)<T>(document, variables);
    await this.log.write({ kind: 'graph.x402.query', subgraphId, chain: x402PaymentChain(this.env), costUsd: this.env === 'production' ? GRAPH_X402_PRICE_USD : 0.01 });
    return unwrap(res as GraphQLResult<T>, subgraphId);
  }
}

/** Offline client: resolves documents from fixtures. Used by tests and MOCK=1 runs. */
export class MockGraphClient implements GraphClient {
  readonly mode = 'mock' as const;
  readonly calls: { subgraphId: string; document: string; variables?: Record<string, unknown> }[] = [];
  constructor(private readonly resolve: (subgraphId: string, document: string, variables?: Record<string, unknown>) => unknown) {}

  async query<T = unknown>(subgraphId: string, document: string, variables?: Record<string, unknown>): Promise<T> {
    this.calls.push({ subgraphId, document, variables });
    return this.resolve(subgraphId, document, variables) as T;
  }
}
