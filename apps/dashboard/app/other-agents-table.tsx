'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { fetchMarketplace } from '@/lib/marketplace';
import { formatUsd, RailBadge } from './components';

const PAGE_SIZE = 10;

export function OtherAgentsTable({ listings }: { listings: Awaited<ReturnType<typeof fetchMarketplace>>['listings'] }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(listings.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const pageListings = listings.slice(start, start + PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-[var(--line)] opacity-70">
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
            {pageListings.map((l) => {
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
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-xs text-[var(--ink-3)]">
          <span>
            Showing {start + 1}–{Math.min(start + PAGE_SIZE, listings.length)} of {listings.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded border border-[var(--line)] px-2 py-1 font-medium disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              Page {page + 1} of {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="rounded border border-[var(--line)] px-2 py-1 font-medium disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
