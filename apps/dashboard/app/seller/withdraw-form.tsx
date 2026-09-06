'use client';

import { useState } from 'react';

export function WithdrawForm() {
  const [amount, setAmount] = useState('0.01');
  const [status, setStatus] = useState<{ kind: 'idle' | 'pending' | 'ok' | 'error'; message?: string }>({ kind: 'idle' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: 'pending' });
    try {
      const res = await fetch('/api/seller/withdraw', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setStatus({ kind: 'ok', message: `withdrew ${body.formattedAmount ?? amount} USDC — tx ${body.mintTxHash ?? 'pending'}` });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-[var(--ink-3)]">Amount (USDC)</span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-32 rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm"
          inputMode="decimal"
        />
      </label>
      <button
        type="submit"
        disabled={status.kind === 'pending'}
        className="rounded bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {status.kind === 'pending' ? 'Withdrawing…' : 'Withdraw to seller wallet'}
      </button>
      {status.kind === 'ok' && <span className="text-sm text-[var(--good)]">{status.message}</span>}
      {status.kind === 'error' && <span className="text-sm text-[var(--bad)]">{status.message}</span>}
    </form>
  );
}
