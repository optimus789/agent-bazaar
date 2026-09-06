import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LanguageModelV2, LanguageModelV2CallOptions } from '@ai-sdk/provider';
import { jsonlLogger } from '@bazaar/shared';
import { fixtureClient } from '@bazaar/graph';
import { runAgent } from '../src/agent.js';
import { makeMockArcRail, makeMockGraphRail, makeMockHederaRail } from '../src/mockRails.js';

/**
 * A scripted LLM stub. Each entry is either a tool call to make or a final
 * text response; the stub advances one entry per `doGenerate` call, mirroring
 * how a real model would step through discover -> rank -> buy -> feedback ->
 * final answer. This is the "LLM stub" the WP06 brief's behaviour spec asks for.
 */
type ScriptStep = { toolCall: { toolName: string; input: Record<string, unknown> } } | { text: string };

function scriptedModel(steps: ScriptStep[]): LanguageModelV2 {
  let i = 0;
  return {
    specificationVersion: 'v2',
    provider: 'stub',
    modelId: 'stub-model',
    supportedUrls: {},
    async doGenerate(_options: LanguageModelV2CallOptions) {
      const step = steps[i++];
      if (!step) throw new Error('scriptedModel: ran out of scripted steps');
      if ('text' in step) {
        return { content: [{ type: 'text', text: step.text }], finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [] };
      }
      return {
        content: [{ type: 'tool-call', toolCallId: `call${i}`, toolName: step.toolCall.toolName, input: JSON.stringify(step.toolCall.input) }],
        finishReason: 'tool-calls',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      };
    },
  } as unknown as LanguageModelV2;
}

const BUYER_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001' as const;

function baseDeps(model: LanguageModelV2, budgetUsd: number, log: ReturnType<typeof jsonlLogger>) {
  const graphClient = fixtureClient();
  return {
    model: model as never,
    graphClient,
    hederaRail: makeMockHederaRail(),
    arcRail: makeMockArcRail(),
    graphRail: makeMockGraphRail(graphClient),
    buyerPrivateKeyEvm: BUYER_KEY,
    budgetUsd,
    log,
  };
}

describe('runAgent', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'buyer-agent-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('runs a discover -> buy -> final-report script and returns the model text', async () => {
    const log = jsonlLogger('buyer', dir);
    const model = scriptedModel([
      { toolCall: { toolName: 'discover_providers', input: {} } },
      { toolCall: { toolName: 'buy_hedera', input: { url: 'http://localhost:4021/v1/usdc/brief/pool', body: { poolId: '0xabc' }, priceUsd: 0.002 } } },
      { text: 'Purchases made: 1 Hedera brief for $0.002. Budget: spent $0.002 of $0.05.' },
    ]);
    const result = await runAgent('risk brief on pool 0xabc', baseDeps(model, 0.05, log));
    expect(result.finalText).toContain('Purchases made');
    expect(result.ledger.spentUsd).toBeCloseTo(0.002);
    expect(result.ledger.remainingUsd).toBeCloseTo(0.048);
    expect(result.steps).toBe(3);
  });

  it('the ledger hard-caps spend: a buy that would exceed budget is refused before any payment happens', async () => {
    const log = jsonlLogger('buyer', dir);
    // The model "misbehaves" and tries to spend more than the budget allows.
    // BudgetLedger.reserve throws synchronously before the rail is ever called —
    // the AI SDK's tool-execution step catches that and feeds it back to the
    // model as a tool-error result (this is generateText's own error-recovery
    // behaviour, not something runAgent opts into), so the model gets a chance
    // to respond sanely instead of the whole process crashing. The budget
    // enforcement itself is what we're testing: no money moved.
    const model = scriptedModel([
      { toolCall: { toolName: 'buy_hedera', input: { url: 'http://x/route', body: {}, priceUsd: 0.06 } } },
      { text: 'That purchase was refused: it would have exceeded the budget.' },
    ]);
    const result = await runAgent('spend too much', baseDeps(model, 0.05, log));
    expect(result.ledger.spentUsd).toBe(0); // the over-budget call never actually paid
    expect(result.ledger.receipts).toHaveLength(0);
    expect(result.finalText).toMatch(/refused/);
  });

  it('chains a Hedera purchase and an Arc purchase within budget', async () => {
    const log = jsonlLogger('buyer', dir);
    const model = scriptedModel([
      { toolCall: { toolName: 'buy_hedera', input: { url: 'http://x/brief', body: {}, priceUsd: 0.002 } } },
      { toolCall: { toolName: 'buy_arc', input: { url: 'http://y/classify', body: {}, priceUsd: 0.0005 } } },
      { text: 'Two purchases made across both rails.' },
    ]);
    const result = await runAgent('classify a brief', baseDeps(model, 0.01, log));
    expect(result.ledger.receipts).toHaveLength(2);
    expect(result.ledger.receipts.map((r) => r.rail)).toEqual(['hedera', 'arc']);
    expect(result.ledger.spentUsd).toBeCloseTo(0.0025);
  });

  it('appends one decision-log entry per tool call to the JSONL log', async () => {
    const log = jsonlLogger('buyer', dir);
    const model = scriptedModel([
      { toolCall: { toolName: 'buy_hedera', input: { url: 'http://x/route', body: {}, priceUsd: 0.001 } } },
      { text: 'done' },
    ]);
    await runAgent('a task', baseDeps(model, 0.01, log));
    const lines = (await readFile(log.file, 'utf8')).trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry.toolCall.name).toBe('buy_hedera');
    expect(entry.result).toBeDefined();
  });

  it('respects a custom maxSteps and stops the loop', async () => {
    const log = jsonlLogger('buyer', dir);
    const model = scriptedModel([
      { toolCall: { toolName: 'budget_status', input: {} } },
      { toolCall: { toolName: 'budget_status', input: {} } },
      { toolCall: { toolName: 'budget_status', input: {} } },
      { text: 'should not be reached with maxSteps 2' },
    ]);
    const result = await runAgent('check budget repeatedly', { ...baseDeps(model, 0.01, log), maxSteps: 2 });
    expect(result.steps).toBeLessThanOrEqual(2);
  });
});
