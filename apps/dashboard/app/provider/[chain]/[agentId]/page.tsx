import { notFound } from 'next/navigation';
import { fixtureClient, getAgent, knownProviderFallback, StudioClient } from '@bazaar/graph';
import type { Agent0Chain } from '@bazaar/shared';
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
  const rawListing = await getAgent(client, chain as Agent0Chain, agentId).catch(() => undefined);
  if (!rawListing) notFound();
  // Agent0's registrationFile crawl is still stuck for our own agents (see
  // packages/graph/src/knownProviders.ts) — a listing that exists on-chain but
  // has no x402Support/rail/name yet falls back to the same data our own
  // registration files already advertise, rather than showing "agent 9179 · Graph".
  const listing = rawListing.x402Support ? rawListing : (knownProviderFallback(rawListing.id) ?? rawListing);

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
    </div>
  );
}
