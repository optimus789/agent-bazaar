import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateText, stepCountIs, type LanguageModel, type ToolSet } from 'ai';
import { jsonlLogger, jsonlLoggerWithPostgres, PostgresJsonlLog } from '@bazaar/shared';
import { BudgetLedger } from './ledger.js';
import { makeDiscoverTool } from './tools/discover.js';
import { rankTool } from './tools/rank.js';
import { makeBuyHederaTool, makeBuyArcTool, makeGraphQueryTool } from './tools/buy.js';
import { makeFeedbackTool } from './tools/feedback.js';
import { makeBudgetStatusTool } from './tools/budget.js';
import type { HederaRail } from './rails/hedera.js';
import type { ArcRail } from './rails/arc.js';
import type { GraphRail } from './rails/graph.js';
import type { GraphClient } from '@bazaar/graph';

const here = dirname(fileURLToPath(import.meta.url));

export interface AgentDeps {
  model: LanguageModel;
  graphClient: GraphClient;
  hederaRail: HederaRail;
  arcRail: ArcRail;
  graphRail: GraphRail;
  buyerPrivateKeyEvm: `0x${string}`;
  budgetUsd: number;
  maxSteps?: number;
  /** decision log; defaults to data/buyer.jsonl */
  log?: ReturnType<typeof jsonlLogger>;
  /**
   * Read-only Hedera tools from @hashgraph/hedera-agent-kit (see
   * src/tools/hederaKit.ts). Optional: omitted in --mock runs and in tests,
   * which have no funded testnet operator to query with, so the agent keeps
   * working with only our own marketplace tools.
   */
  hederaKitTools?: ToolSet;
}

export interface AgentRunResult {
  finalText: string;
  ledger: ReturnType<BudgetLedger['status']>;
  steps: number;
}

async function loadSystemPrompt(): Promise<string> {
  return readFile(resolve(here, '../prompts/system.md'), 'utf8');
}

export function buildTools(
  deps: Pick<AgentDeps, 'graphClient' | 'hederaRail' | 'arcRail' | 'graphRail' | 'buyerPrivateKeyEvm' | 'hederaKitTools'>,
  ledger: BudgetLedger,
): ToolSet {
  return {
    discover_providers: makeDiscoverTool(deps.graphClient),
    rank_providers: rankTool,
    buy_hedera: makeBuyHederaTool(deps.hederaRail, ledger),
    buy_arc: makeBuyArcTool(deps.arcRail, ledger),
    graph_query: makeGraphQueryTool(deps.graphRail, ledger),
    leave_feedback: makeFeedbackTool(deps.buyerPrivateKeyEvm),
    budget_status: makeBudgetStatusTool(ledger),
    // Spread last, but these are read-only queries under distinct
    // `get_*_query_tool` names, so they cannot shadow a tool above.
    ...(deps.hederaKitTools ?? {}),
  };
}

/**
 * Runs the procurement agent on one task. Every tool call and its result is
 * appended to `data/buyer.jsonl` as `{ step, reasoning, toolCall, result }`
 * (WP06 behaviour spec item 4) so the dashboard can show the decision log live.
 */
export async function runAgent(task: string, deps: AgentDeps): Promise<AgentRunResult> {
  const ledger = new BudgetLedger(deps.budgetUsd);
  const tools = buildTools(deps, ledger);
  const system = await loadSystemPrompt();
  const log = deps.log ?? jsonlLogger('buyer');

  const result = await generateText({
    model: deps.model,
    system,
    prompt: `${task}\n\nBudget for this task: $${deps.budgetUsd.toFixed(6)}.`,
    tools,
    stopWhen: stepCountIs(deps.maxSteps ?? 12),
  });

  for (const [stepIndex, step] of result.steps.entries()) {
    for (const toolResult of step.toolResults ?? []) {
      await log.write({
        step: stepIndex,
        reasoning: step.text || undefined,
        toolCall: { name: toolResult.toolName, input: toolResult.input },
        result: toolResult.output,
      });
    }
    // step.toolResults only carries successful calls — a thrown tool (e.g. a
    // 502 from a provider mid-payment) lands as a 'tool-error' part in
    // step.content instead, and would otherwise vanish from the decision log
    // silently. The dashboard and judges need to see failures, not just wins.
    for (const part of step.content ?? []) {
      if (part.type === 'tool-error') {
        await log.write({
          step: stepIndex,
          reasoning: step.text || undefined,
          toolCall: { name: part.toolName, input: part.input },
          error: part.error instanceof Error ? part.error.message : String(part.error),
        });
      }
    }
  }

  return { finalText: result.text, ledger: ledger.status(), steps: result.steps.length };
}
