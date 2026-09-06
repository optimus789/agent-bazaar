'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Marketplace' },
  { href: '/agent', label: 'Agent' },
  { href: '/payments', label: 'Payments' },
  { href: '/seller', label: 'Seller' },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
      <Link href="/" className="font-semibold tracking-tight text-[var(--ink)] no-underline">
        Agent Bazaar
      </Link>
      <nav className="flex gap-1 text-sm">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded px-3 py-1.5 no-underline transition-colors ${
                active ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium' : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)]'
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
