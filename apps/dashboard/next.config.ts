import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The dashboard reads the repo's shared/graph packages directly by source
  // (workspace:* + tsx-free .ts imports), so let Next.js transpile them.
  transpilePackages: ['@bazaar/shared', '@bazaar/graph'],
  experimental: {
    // packages/shared and packages/graph use NodeNext-style relative imports
    // ("./agent0.js") that resolve to .ts files on disk — the convention every
    // other app in the monorepo (tsc, tsx, vitest) already understands natively.
    // Turbopack's default resolver takes ".js" literally and 404s, so alias it
    // to also try the real extensions.
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
  },
};

export default nextConfig;
