import { describe, expect, it } from 'vitest';
import { BudgetLedger } from '../src/ledger.js';
import { buildTools } from '../src/agent.js';
import { fixtureClient } from '@bazaar/graph';
import { makeMockArcRail, makeMockGraphRail, makeMockHederaRail } from '../src/mockRails.js';
import type { ToolSet } from 'ai';

const BUYER_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001' as const;

function baseToolDeps(hederaKitTools?: ToolSet) {
  const graphClient = fixtureClient();
  return {
    graphClient,
    hederaRail: makeMockHederaRail(),
    arcRail: makeMockArcRail(),
    graphRail: makeMockGraphRail(graphClient),
    buyerPrivateKeyEvm: BUYER_KEY,
    hederaKitTools,
  };
}

const OUR_TOOLS = ['discover_providers', 'rank_providers', 'buy_hedera', 'buy_arc', 'graph_query', 'leave_feedback', 'budget_status'];

describe('Hedera Agent Kit tool integration', () => {
  it('exposes only our own tools when the kit is not wired in (mock runs, tests)', () => {
    const tools = buildTools(baseToolDeps(undefined), new BudgetLedger(1));
    expect(Object.keys(tools).sort()).toEqual([...OUR_TOOLS].sort());
  });

  it('merges kit tools alongside our own without dropping any of ours', () => {
    const kit = { get_hbar_balance_query_tool: { description: 'stub', execute: async () => ({}) } } as unknown as ToolSet;
    const tools = buildTools(baseToolDeps(kit), new BudgetLedger(1));
    for (const name of OUR_TOOLS) expect(tools).toHaveProperty(name);
    expect(tools).toHaveProperty('get_hbar_balance_query_tool');
  });

  /**
   * The core safety property of src/tools/hederaKit.ts. The kit ships
   * transaction tools (TRANSFER_HBAR_TOOL, DELETE_ACCOUNT_TOOL, token minting)
   * that call the Hedera SDK directly and would therefore move funds WITHOUT
   * passing through BudgetLedger.reserve() — voiding the hard budget cap that
   * every buy_* tool depends on. Registering only coreAccountQueryPlugin is
   * what prevents that, so assert on the real plugin's real tool list rather
   * than trusting the comment to stay true.
   */
  it('registers no fund-moving tools: the kit plugin we use is queries only', async () => {
    const { coreAccountQueryPlugin } = await import('@hashgraph/hedera-agent-kit/plugins');
    const names = coreAccountQueryPlugin.tools({} as never).map((t: { method: string }) => t.method);

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).toMatch(/query/i);
      expect(name).not.toMatch(/transfer|delete|create|mint|update|approve|airdrop|associate|submit/i);
    }
  });
});
