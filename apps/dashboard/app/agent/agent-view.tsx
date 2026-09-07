'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatTs, RailBadge } from '../components';
import type { Rail } from '@bazaar/shared';

const INITIAL_VISIBLE = 20;
const LOAD_MORE_STEP = 20;

interface DecisionEntry {
  ts: string;
  step: number;
  reasoning?: string;
  toolCall: { name: string; input: unknown };
  result: unknown;
}

const TOOL_RAIL: Record<string, Rail | undefined> = {
  buy_hedera: 'hedera',
  buy_arc: 'arc',
  graph_query: 'graph',
};

function receiptFrom(result: unknown): { amountUsd?: number; txId?: string; rail?: Rail } | undefined {
  if (result && typeof result === 'object' && 'receipt' in result) {
    const r = (result as { receipt?: { amountUsd?: number; txId?: string; rail?: Rail } }).receipt;
    return r;
  }
  return undefined;
}

export function AgentView() {
  const [entries, setEntries] = useState<DecisionEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    const source = new EventSource('/api/stream');
    source.addEventListener('ready', () => setConnected(true));
    source.addEventListener('entry', (ev) => {
      try {
        const entry = JSON.parse((ev as MessageEvent).data) as DecisionEntry;
        const key = `${entry.ts}:${entry.step}:${entry.toolCall?.name}`;
        if (seenRef.current.has(key)) return;
        seenRef.current.add(key);
        setEntries((prev) => [...prev, entry]);
      } catch {
        /* ignore malformed lines */
      }
    });
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);

  const spentUsd = entries.reduce((sum, e) => sum + (receiptFrom(e.result)?.amountUsd ?? 0), 0);
  // Newest first — new live steps should appear at the top, not require
  // scrolling past the whole accumulated history. Rendering is capped
  // separately (visibleCount) so a long-running log doesn't dump every step
  // into the DOM at once.
  const reversed = useMemo(() => [...entries].reverse(), [entries]);
  const visible = reversed.slice(0, visibleCount);
  const hasMore = visibleCount < reversed.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: connected ? 'var(--good)' : 'var(--ink-3)' }} />
          {connected ? 'live — tailing data/buyer.jsonl' : 'connecting…'}
        </div>
        <div className="text-sm">
          Spent so far: <span className="font-mono font-medium">${spentUsd.toFixed(6)}</span>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--ink-3)]">
          No decisions logged yet. Run <code className="font-mono">pnpm --filter buyer-agent start -- &quot;risk brief on pool X&quot; --budget 0.02 --live</code>{' '}
          in another terminal to see it appear here in real time.
        </div>
      ) : (
        <>
          <p className="text-xs text-[var(--ink-3)]">
            Showing newest {visible.length} of {reversed.length} steps.
          </p>
          <ol className="flex flex-col gap-3">
            {visible.map((e) => {
              const receipt = receiptFrom(e.result);
              const rail = receipt?.rail ?? TOOL_RAIL[e.toolCall?.name];
              return (
                <li key={`${e.ts}:${e.step}:${e.toolCall?.name}`} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-xs">step {e.step}</span>
                      <span className="font-mono text-sm font-medium">{e.toolCall?.name}</span>
                      {rail && <RailBadge rail={rail} />}
                    </div>
                    <span className="text-xs text-[var(--ink-3)]">{formatTs(e.ts)}</span>
                  </div>
                  {e.reasoning && <p className="mt-2 text-sm text-[var(--ink-2)]">{e.reasoning}</p>}
                  {receipt?.amountUsd !== undefined && (
                    <p className="mt-2 text-xs">
                      paid <span className="font-mono">${receipt.amountUsd}</span>
                      {receipt.txId && <span className="ml-2 font-mono text-[var(--ink-3)]">{receipt.txId}</span>}
                    </p>
                  )}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-[var(--ink-3)]">tool input / result</summary>
                    <pre className="mt-2 overflow-x-auto rounded bg-[var(--surface-2)] p-2 text-xs">
                      {JSON.stringify({ input: e.toolCall?.input, result: e.result }, null, 2)}
                    </pre>
                  </details>
                </li>
              );
            })}
          </ol>
          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + LOAD_MORE_STEP)}
              className="self-start rounded border border-[var(--line)] px-3 py-1.5 text-xs font-medium"
            >
              Load older ({reversed.length - visibleCount} more)
            </button>
          )}
        </>
      )}
    </div>
  );
}
