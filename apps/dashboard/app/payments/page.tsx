import { explorerUrlFor, totalsByRail, unifiedPayments } from '@/lib/payments';
import { Card, Empty, formatTs, formatUsd, RailBadge } from '../components';

export const revalidate = 0;

export default async function PaymentsPage() {
  const payments = await unifiedPayments();
  const totals = totalsByRail(payments);
  const grandTotal = totals.reduce((sum, t) => sum + t.totalUsd, 0);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ink-2)]">
          Every settled payment across all three rails: x402 queries to The Graph gateway, Hedera settlements via Blocky402,
          and Arc nanopayments via Circle Gateway.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--ink-3)]">Total spent</div>
          <div className="mt-1 text-2xl font-semibold">{formatUsd(grandTotal)}</div>
        </Card>
        {(['hedera', 'arc', 'graph'] as const).map((rail) => {
          const t = totals.find((x) => x.rail === rail);
          return (
            <Card key={rail} className="p-4">
              <div className="flex items-center justify-between">
                <RailBadge rail={rail} />
                <span className="text-xs text-[var(--ink-3)]">{t?.count ?? 0} payments</span>
              </div>
              <div className="mt-2 text-xl font-semibold">{formatUsd(t?.totalUsd)}</div>
            </Card>
          );
        })}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-3)]">All payments ({payments.length})</h2>
        {payments.length === 0 ? (
          <Empty>No payments recorded yet in data/*.jsonl. Run a provider and the buyer agent to populate this.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-left text-xs uppercase tracking-wide text-[var(--ink-3)]">
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Rail</th>
                  <th className="px-4 py-2 font-medium">Side</th>
                  <th className="px-4 py-2 font-medium">Route</th>
                  <th className="px-4 py-2 font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Tx</th>
                </tr>
              </thead>
              <tbody>
                {payments.slice(-100).reverse().map((p, i) => {
                  const url = explorerUrlFor(p.rail, p.txId, p.network);
                  return (
                    <tr key={i} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface-2)]">
                      <td className="px-4 py-3 text-xs text-[var(--ink-3)]">{formatTs(p.ts)}</td>
                      <td className="px-4 py-3">
                        <RailBadge rail={p.rail} />
                      </td>
                      <td className="px-4 py-3 text-xs">{p.side}</td>
                      <td className="px-4 py-3 truncate font-mono text-xs">{p.route ?? '—'}</td>
                      <td className="px-4 py-3">{formatUsd(p.amountUsd)}</td>
                      <td className="px-4 py-3 text-xs">
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer" className="font-mono">
                            {p.txId?.slice(0, 14)}…
                          </a>
                        ) : (
                          p.txId ?? '—'
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
