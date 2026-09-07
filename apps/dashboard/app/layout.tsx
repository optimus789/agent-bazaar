import type { Metadata } from 'next';
import './globals.css';
import { Nav } from './nav';

const title = 'Agent Bazaar';
const description = 'An AI buyer agent that shops a live marketplace on its own — discovers paid APIs, pays with real testnet crypto, and leaves an on-chain review.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:3000'),
  title,
  description,
  openGraph: { title, description, type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap" />
      </head>
      <body className="min-h-screen">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col">
          <Nav />
          <main className="flex-1 px-6 py-8">{children}</main>
          <footer className="border-t border-[var(--line)] px-6 py-4 text-xs text-[var(--ink-3)]">
            Agent Bazaar — ETHOnline 2026 demo dashboard
          </footer>
        </div>
      </body>
    </html>
  );
}
