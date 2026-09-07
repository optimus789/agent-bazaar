import Link from 'next/link';
import { fetchMarketplace } from '@/lib/marketplace';
import { fetchHealth, PROVIDERS } from '@/lib/providers';
import { Card, Empty, formatUsd, RailBadge, StatusDot } from './components';
import { OtherAgentsTable } from './other-agents-table';

export const revalidate = 0;

/** The two providers this project actually built and runs. Everything else in
 * the table below was discovered on the public Agent0 subgraph and isn't ours —
 * see packages/graph/src/knownProviders.ts for the canonical ids. */
const OUR_AGENT_IDS = new Set(['84532:9179', '84532:9180']);

export default async function MarketplacePage() {
  const [{ listings, mode }, hederaHealth, arcHealth] = await Promise.all([
    fetchMarketplace(),
    fetchHealth(PROVIDERS.hedera),
    fetchHealth(PROVIDERS.arc),
  ]);
  const ourListings = listings.filter((l) => OUR_AGENT_IDS.has(l.id));
  const otherListings = listings.filter((l) => !OUR_AGENT_IDS.has(l.id));

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Agent Bazaar</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ink-2)]">
          An AI buyer agent that shops a live marketplace on its own: it discovers paid APIs, decides which one is worth
          the money, pays for it with real testnet crypto, and leaves an on-chain review — no human clicking anything.
        </p>
        <Card className="mt-4 p-4">
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">1. Sellers</div>
              <p className="mt-1 text-[var(--ink-2)]">
                We built and run 2 API servers below (&quot;Bazaar Market Intel&quot; on Hedera, &quot;Bazaar Task Runner&quot; on
                Arc). Each sells a few endpoints behind an x402 paywall and has an on-chain ERC-8004 identity.
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">2. Discovery</div>
              <p className="mt-1 text-[var(--ink-2)]">
                Both sellers register on The Graph&apos;s Agent0 subgraph. The buyer agent — and this page — finds them
                (and 14 other unrelated public agents) with one query, no central directory.
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">3. The buyer</div>
              <p className="mt-1 text-[var(--ink-2)]">
                A Claude-powered agent (<code className="font-mono text-xs">apps/buyer-agent</code>) reads a task, picks a
                seller, pays, and rates it. Watch it think in real time on the{' '}
                <Link href="/agent" className="font-medium">
                  Agent
                </Link>{' '}
                tab.
              </p>
            </div>
          </div>
        </Card>
        {mode !== 'studio' && (
          <p className="mt-2 text-xs text-[var(--warn)]">
            {mode === 'mock' ? 'Showing fixture data (MOCK=1 or Studio query failed).' : 'GRAPH_API_KEY not set — showing fixture data.'}
          </p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Hedera provider</span>
            <StatusDot ok={!!hederaHealth} />
          </div>
          <p className="mt-1 text-xs text-[var(--ink-3)]">{PROVIDERS.hedera}</p>
          {hederaHealth ? (
            <dl className="mt-3 space-y-1 text-xs">
              <Row label="chain" value={hederaHealth.chain} />
              <Row label="pay to" value={hederaHealth.payTo} mono />
              <Row label="facilitator" value={hederaHealth.facilitator} />
              <Row label="mode" value={hederaHealth.mock ? 'mock' : 'live'} />
            </dl>
          ) : (
            <p className="mt-3 text-xs text-[var(--bad)]">unreachable — start it with `pnpm --filter provider-hedera dev`</p>
          )}
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Arc provider</span>
            <StatusDot ok={!!arcHealth} />
          </div>
          <p className="mt-1 text-xs text-[var(--ink-3)]">{PROVIDERS.arc}</p>
          {arcHealth ? (
            <dl className="mt-3 space-y-1 text-xs">
              <Row label="chain" value={arcHealth.chain} />
              <Row label="seller" value={arcHealth.sellerAddress} mono />
              <Row label="Gateway balance" value={arcHealth.gatewayBalanceUsd !== undefined ? formatUsd(arcHealth.gatewayBalanceUsd) : '—'} />
              <Row label="mode" value={arcHealth.mock ? 'mock' : 'live'} />
            </dl>
          ) : (
            <p className="mt-3 text-xs text-[var(--bad)]">unreachable — start it with `pnpm --filter provider-arc dev`</p>
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-3)]">Our sellers ({ourListings.length})</h2>
        <p className="mb-3 max-w-2xl text-xs text-[var(--ink-3)]">
          These are the 2 providers this project built. The buyer agent shops between them (and, in principle, anything
          else on the subgraph) using the ranking in{' '}
          <code className="font-mono">apps/buyer-agent/src/ranking.ts</code>.
        </p>
        <ProvidersTable listings={ourListings} emptyMessage="No providers discovered yet. Register one with `pnpm --filter @bazaar/identity cli register`." />
      </section>

      {otherListings.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-3)]">
            Other agents on The Graph ({otherListings.length})
          </h2>
          <p className="mb-3 max-w-2xl text-xs text-[var(--ink-3)]">
            Not ours — these are unrelated agents other builders registered on the same public Agent0 subgraph. Shown to
            prove discovery is a real, open query, not a hardcoded list of 2.
          </p>
          <OtherAgentsTable listings={otherListings} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-3)]">How it works</h2>
        <ArchitectureDiagram />
      </section>
    </div>
  );
}

function ProvidersTable({
  listings,
  emptyMessage,
}: {
  listings: Awaited<ReturnType<typeof fetchMarketplace>>['listings'];
  emptyMessage?: string;
}) {
  if (listings.length === 0) return emptyMessage ? <Empty>{emptyMessage}</Empty> : null;
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-left text-xs uppercase tracking-wide text-[var(--ink-3)]">
            <th className="px-4 py-2 font-medium">Provider</th>
            <th className="px-4 py-2 font-medium">Rail</th>
            <th className="px-4 py-2 font-medium">Cheapest route</th>
            <th className="px-4 py-2 font-medium">Reputation</th>
            <th className="px-4 py-2 font-medium">Validations</th>
            <th className="px-4 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => {
            const cheapest = l.routes.length ? Math.min(...l.routes.map((r) => r.priceUsd)) : undefined;
            return (
              <tr key={l.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface-2)]">
                <td className="px-4 py-3">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-[var(--ink-3)]">
                    {l.chain} · agent #{l.agentId}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <RailBadge rail={l.rail} />
                </td>
                <td className="px-4 py-3">{cheapest !== undefined ? formatUsd(cheapest) : 'no priced routes'}</td>
                <td className="px-4 py-3">{l.avgScore !== undefined ? `${l.avgScore.toFixed(0)}/100 (${l.totalFeedback})` : 'untested'}</td>
                <td className="px-4 py-3">{l.validations}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/provider/${l.chain}/${l.agentId}`} className="text-xs font-medium">
                    Details →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--ink-3)]">{label}</dt>
      <dd className={`truncate text-right ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function ArchitectureDiagram() {
  return (
    <Card className="overflow-x-auto p-5">
      <pre className="whitespace-pre text-xs leading-tight text-[var(--ink-2)]">{`
  Buyer agent ──x402(USDC/Base)──▶ The Graph gateway ──▶ Agent0 subgraphs (Base Sepolia + Sepolia)
      │
      ├──x402(USDC/HBAR via Blocky402)──▶ Hedera provider ──▶ HCS receipt topic
      │
      └──Nanopayments (Circle Gateway)──▶ Arc provider ──▶ Gateway balance ──▶ withdraw

  Every settled payment posts ERC-8004 feedback back to the Reputation Registry,
  visible on the next discovery pass through the Agent0 subgraph.
`}</pre>
    </Card>
  );
}
