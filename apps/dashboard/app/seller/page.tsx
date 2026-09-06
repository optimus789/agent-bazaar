import { fetchHealth, fetchSellerEarnings, PROVIDERS } from '@/lib/providers';
import { explorerUrlFor } from '@/lib/payments';
import { Card, Empty, formatTs, formatUsd } from '../components';
import { WithdrawForm } from './withdraw-form';

export const revalidate = 0;

export default async function SellerPage() {
  const [health, earnings] = await Promise.all([fetchHealth(PROVIDERS.arc), fetchSellerEarnings(PROVIDERS.arc)]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Seller — Arc provider</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ink-2)]">
          Earnings and Gateway balance for the Bazaar Task Runner on Arc testnet, and a withdraw action to the payout wallet.
        </p>
      </section>

      {!health ? (
        <Empty>Provider unreachable at {PROVIDERS.arc} — start it with `pnpm --filter provider-arc dev`.</Empty>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--ink-3)]">Total earned (recorded)</div>
              <div className="mt-1 text-2xl font-semibold">{formatUsd(earnings?.ledger.totalUsd)}</div>
              <div className="text-xs text-[var(--ink-3)]">{earnings?.ledger.totalPayments ?? 0} payments</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--ink-3)]">Gateway available</div>
              <div className="mt-1 text-2xl font-semibold font-mono">
                {earnings?.gateway && 'gateway' in earnings.gateway ? earnings.gateway.gateway.available : '—'}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--ink-3)]">Gateway total</div>
              <div className="mt-1 text-2xl font-semibold font-mono">
                {earnings?.gateway && 'gateway' in earnings.gateway ? earnings.gateway.gateway.total : '—'}
              </div>
            </Card>
          </section>

          {earnings?.gateway && 'error' in earnings.gateway && (
            <p className="text-xs text-[var(--warn)]">Gateway balance unavailable: {earnings.gateway.error}</p>
          )}

          <p className="text-xs text-[var(--ink-3)]">
            Gateway balance above is always live from Circle. Circle Nanopayments settle in batches rather than one
            transaction per payment, so there is no on-chain history to query per payment before a batch settles — the
            list below is this provider process&apos;s own record and resets if the provider restarts.
          </p>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-3)]">Withdraw</h2>
            <Card className="p-4">
              <WithdrawForm />
            </Card>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-3)]">Recent payments</h2>
            {!earnings?.ledger.recent.length ? (
              <Empty>No payments recorded yet.</Empty>
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
                    {earnings.ledger.recent.map((r, i) => {
                      const url = explorerUrlFor('arc', r.transaction, r.network);
                      return (
                        <tr key={i} className="border-b border-[var(--line)] last:border-0">
                          <td className="px-4 py-3 text-xs text-[var(--ink-3)]">{formatTs(r.ts)}</td>
                          <td className="px-4 py-3 font-mono text-xs">{r.route}</td>
                          <td className="px-4 py-3">{formatUsd(r.amountUsd)}</td>
                          <td className="px-4 py-3 text-xs">
                            {url ? (
                              <a href={url} target="_blank" rel="noreferrer" className="font-mono">
                                {r.transaction?.slice(0, 14)}…
                              </a>
                            ) : (
                              r.transaction ?? '—'
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
        </>
      )}
    </div>
  );
}
