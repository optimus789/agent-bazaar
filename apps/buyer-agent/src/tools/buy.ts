import { tool } from 'ai';
import { z } from 'zod';
import { explorerTxUrl } from '@bazaar/shared';
import type { BudgetLedger } from '../ledger.js';
import type { HederaRail } from '../rails/hedera.js';
import type { ArcRail } from '../rails/arc.js';
import type { GraphRail } from '../rails/graph.js';

/**
 * The ledger's `reserve()` throws BEFORE any of these tools touch the network,
 * so the hard cap is enforced by code, not by the model choosing to behave —
 * per WP06's gotcha "never let the model construct payment payloads; tools do".
 */

export function makeBuyHederaTool(rail: HederaRail, ledger: BudgetLedger) {
  return tool({
    description: 'Pay a Bazaar provider on Hedera testnet via x402 (settled through Blocky402). Provide the full route URL, the JSON body the route expects, and its advertised priceUsd from the provider catalog.',
    inputSchema: z.object({
      url: z.string().url(),
      body: z.record(z.string(), z.unknown()),
      priceUsd: z.number().positive(),
    }),
    execute: async ({ url, body, priceUsd }) => {
      ledger.reserve(priceUsd);
      const { data, receipt } = await rail.pay(url, body, priceUsd);
      ledger.record(receipt);
      return { data, receipt: { ...receipt, explorerUrl: receipt.txId ? explorerTxUrl('hedera-testnet', receipt.txId) : undefined } };
    },
  });
}

export function makeBuyArcTool(rail: ArcRail, ledger: BudgetLedger) {
  return tool({
    description: 'Pay a Bazaar provider on Arc testnet via Circle Gateway nanopayments. Provide the full route URL, the JSON body the route expects, and its advertised priceUsd from the provider catalog.',
    inputSchema: z.object({
      url: z.string().url(),
      body: z.record(z.string(), z.unknown()),
      priceUsd: z.number().positive(),
    }),
    execute: async ({ url, body, priceUsd }) => {
      // Reserve against the SHARED ledger before paying, exactly like buy_hedera —
      // the model supplies the catalog price it already read via discover_providers,
      // so this is a real pre-payment cap, not a post-hoc check. The Arc rail's own
      // onBeforePaymentCreation hook (see packages/shared/src/arcBuyer.ts) is a second,
      // independent cap enforced by the SDK itself.
      ledger.reserve(priceUsd);
      const { data, receipt } = await rail.pay(url, body);
      ledger.record(receipt);
      return { data, receipt: { ...receipt, explorerUrl: receipt.txId ? explorerTxUrl('arc-testnet', receipt.txId) : undefined } };
    },
  });
}

export function makeGraphQueryTool(rail: GraphRail, ledger: BudgetLedger) {
  return tool({
    description: 'Run a GraphQL query against a Graph subgraph, paying per query via the x402 gateway on Base (no API key needed). Use for ad-hoc questions the catalog tools do not cover.',
    inputSchema: z.object({
      subgraphId: z.string(),
      query: z.string(),
      variables: z.record(z.string(), z.unknown()).optional(),
    }),
    execute: async ({ subgraphId, query, variables }) => {
      ledger.reserve(0.01); // testnet nominal price; see GraphRail
      const { data, receipt } = await rail.query(subgraphId, query, variables);
      ledger.record(receipt);
      return { data, receipt };
    },
  });
}
