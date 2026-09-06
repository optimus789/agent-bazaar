import type { Rail } from '@bazaar/shared';

const RAIL_STYLE: Record<Rail, { bg: string; fg: string; label: string }> = {
  hedera: { bg: 'var(--hedera-soft)', fg: 'var(--hedera)', label: 'Hedera' },
  arc: { bg: 'var(--arc-soft)', fg: 'var(--arc)', label: 'Arc' },
  graph: { bg: 'var(--graph-soft)', fg: 'var(--graph)', label: 'Graph' },
};

export function RailBadge({ rail }: { rail: Rail }) {
  const s = RAIL_STYLE[rail];
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

export function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full align-middle"
      style={{ background: ok ? 'var(--good)' : 'var(--bad)' }}
      title={ok ? 'reachable' : 'unreachable'}
    />
  );
}

export function formatUsd(n: number | undefined): string {
  if (n === undefined) return '—';
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
}

export function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-[var(--line)] bg-[var(--surface)] ${className}`}>{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--ink-3)]">{children}</div>;
}
