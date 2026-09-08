import { notFound } from 'next/navigation';
import { fixtureClient, getAgentWithFeedback, knownProviderFallback, readOnchainReputation, StudioClient } from '@bazaar/graph';
import { CHAIN_IDS, type Agent0Chain, type ProviderListing } from '@bazaar/shared';
import { GRAPH_API_KEY, MOCK } from '@/lib/env';
import { fetchCatalog, fetchHealth, PROVIDERS } from '@/lib/providers';
import { unifiedPayments, explorerUrlFor } from '@/lib/payments';
import { Card, Empty, formatTs, formatUsd, RailBadge } from '../../../components';

export const revalidate = 0;

const VALID_CHAINS: Agent0Chain[] = ['base-sepolia', 'eth-sepolia'];

export default async function ProviderPage({ params }: { params: Promise<{ chain: string; agentId: string }> }) {
  const { chain, agentId } = await params;
  if (!VALID_CHAINS.includes(chain as Agent0Chain)) notFound();

  const client = MOCK || !GRAPH_API_KEY ? fixtureClient() : new StudioClient(GRAPH_API_KEY);
  let result: Awaited<ReturnType<typeof getAgentWithFeedback>>;
  let queryFailed = false;
  try {
    result = await getAgentWithFeedback(client, chain as Agent0Chain, agentId);
  } catch {
    // The eth-sepolia subgraph in particular is prone to transient
    // "indexing_error" responses even for agents that exist and are listed
    // on the marketplace page moments earlier — a bare notFound() here would
    // wrongly imply the agent doesn't exist, when a retry would likely work.
    queryFailed = true;
  }
  // The subgraph is only an index of the ERC-8004 registries, and it can go
  // dark independently of the chain (2026-09-08: the sole base-sepolia indexer
  // went offline, blanking this page entirely). For our own agents the identity
  // is known statically and reputation is readable straight from the contract,
  // so render the real page from chain data instead of an apology. `degraded`
  // drives the banner explaining why the per-review list is empty.
  let degraded = false;
  let listing: ProviderListing;
  let feedback: NonNullable<Awaited<ReturnType<typeof getAgentWithFeedback>>>['feedback'];

  if (queryFailed || !result) {
    const fallback = knownProviderFallback(`${CHAIN_IDS[chain as Agent0Chain]}:${agentId}`);
    if (!fallback) {
      if (queryFailed) {
        return (
          <Empty>
            The Graph&apos;s {chain} subgraph is temporarily unavailable for agent #{agentId} (indexer error, not a
            missing agent). Try again shortly.
          </Empty>
        );
      }
      notFound();
    }
    const onchain = await readOnchainReputation(chain as Agent0Chain, agentId).catch(() => ({ totalFeedback: 0, avgScore: undefined }));
    degraded = true;
    listing = { ...fallback, totalFeedback: onchain.totalFeedback, avgScore: onchain.avgScore };
    feedback = [];
  } else {
    const { listing: rawListing, feedback: subgraphFeedback } = result;
    feedback = subgraphFeedback;
  // Agent0's registrationFile crawl is still stuck for our own agents (see
  // packages/graph/src/knownProviders.ts) — a listing that exists on-chain but
  // has no x402Support/rail/name yet falls back to the same data our own
  // registration files already advertise, rather than showing "agent 9179 · Graph".
  // Only the fallback's identity fields are missing on rawListing — its
  // avgScore/totalFeedback are real, live subgraph data and must not be
  // discarded just because registrationFile hasn't crawled yet.
    listing = rawListing.x402Support ? rawListing : { ...(knownProviderFallback(rawListing.id) ?? rawListing), avgScore: rawListing.avgScore, totalFeedback: rawListing.totalFeedback };
  }

  const baseUrl = listing.rail === 'hedera' ? PROVIDERS.hedera : listing.rail === 'arc' ? PROVIDERS.arc : listing.baseUrl;
  const [health, catalog, allPayments] = await Promise.all([fetchHealth(baseUrl), fetchCatalog(baseUrl), unifiedPayments()]);
  const receipts = allPayments.filter((p) => p.rail === listing.rail && (p.side === 'provider-hedera' || p.side === 'provider-arc'));

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{listing.name}</h1>
          <RailBadge rail={listing.rail} />
        </div>
        <p className="mt-1 text-sm text-[var(--ink-2)]">{listing.description || 'No description in registration file.'}</p>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-[var(--ink-3)]">Chain</dt>
            <dd>{listing.chain}</dd>
          </div>
          <div>
            <dt className="text-[var(--ink-3)]">Agent ID</dt>
            <dd>{listing.agentId}</dd>
          </div>
          <div>
            <dt className="text-[var(--ink-3)]">Owner</dt>
            <dd className="truncate font-mono">{listing.owner}</dd>
          </div>
          <div>
            <dt className="text-[var(--ink-3)]">Reputation</dt>
            <dd>{listing.avgScore !== undefined ? `${listing.avgScore.toFixed(0)}/100 (${listing.totalFeedback} reviews)` : 'untested'}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-3)]">Catalog</h2>
        {!health ? (
          <Empty>Provider unreachable at {baseUrl} — catalog cannot be fetched live.</Empty>
        ) : !catalog?.routes.length ? (
          <Empty>No priced routes advertised.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-left text-xs uppercase tracking-wide text-[var(--ink-3)]">
                  <th className="px-4 py-2 font-medium">Route</th>
                  <th className="px-4 py-2 font-medium">Price</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {catalog.routes.map((r) => (
                  <tr key={`${r.method} ${r.path}`} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">
                      {r.method} {r.path}
                    </td>
                    <td className="px-4 py-3">{formatUsd(r.priceUsd)}{r.altPrice ? ` / ${r.altPrice.amount} tinybars` : ''}</td>
                    <td className="px-4 py-3 text-[var(--ink-2)]">{r.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-3)]">
          Recent settlements {listing.rail === 'hedera' ? '(HCS receipts)' : '(Gateway payments)'}
        </h2>
        {receipts.length === 0 ? (
          <Empty>No settlements recorded yet in data/*.jsonl.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-left text-xs uppercase tracking-wide text-[var(--ink-3)]">
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Route</th>
                  <th className="px-4 py-2 font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Tx</th>
                </tr>
              </thead>
              <tbody>
                {receipts.slice(-20).reverse().map((r, i) => {
                  const url = explorerUrlFor(r.rail, r.txId, r.network);
                  return (
                    <tr key={i} className="border-b border-[var(--line)] last:border-0">
                      <td className="px-4 py-3 text-xs text-[var(--ink-3)]">{formatTs(r.ts)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.route ?? '—'}</td>
                      <td className="px-4 py-3">
                        {formatUsd(r.amountUsd)} {r.asset && r.amountUsd === undefined ? r.asset : ''}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer" className="font-mono">
                            {r.txId?.slice(0, 14)}…
                          </a>
                        ) : (
                          r.txId ?? '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-3)]">
          On-chain feedback ({feedback.length})
        </h2>
        <p className="mb-3 text-xs text-[var(--ink-3)]">
          Every review here is a real `giveFeedback` call on the ERC-8004 Reputation Registry, sourced live from the
          Agent0 subgraph — not a local record, and unaffected by this dashboard restarting.
        </p>
        {degraded ? (
          <p className="mb-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-xs text-[var(--ink-2)]">
            The Graph&apos;s {chain} subgraph is temporarily unavailable, so the individual reviews below cannot be
            listed. The reputation above was read directly from the ERC-8004 Reputation Registry contract instead — the
            subgraph only indexes that contract, so the score is the same real on-chain data.
          </p>
        ) : null}
        {feedback.length === 0 ? (
          <Empty>No feedback recorded on-chain yet.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-left text-xs uppercase tracking-wide text-[var(--ink-3)]">
                  <th className="px-4 py-2 font-medium">Reviewer</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                  <th className="px-4 py-2 font-medium">Tag</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((f, i) => (
                  <tr key={i} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-4 py-3 truncate font-mono text-xs">{f.clientAddress}</td>
                    <td className="px-4 py-3">{f.value ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-[var(--ink-2)]">
                      {f.tag1 ?? '—'}
                      {f.tag2 ? ` / ${f.tag2}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
