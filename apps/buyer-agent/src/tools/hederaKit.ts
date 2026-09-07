import { Client, PrivateKey } from '@hiero-ledger/sdk';
import { AgentMode } from '@hashgraph/hedera-agent-kit';
import { coreAccountQueryPlugin } from '@hashgraph/hedera-agent-kit/plugins';
import { HederaAIToolkit } from '@hashgraph/hedera-agent-kit-ai-sdk';
import type { ToolSet } from 'ai';

export interface HederaKitOptions {
  accountId: string;
  privateKeyEcdsaHex: string;
}

/**
 * Read-only Hedera tools from the official `@hashgraph/hedera-agent-kit`,
 * exposed to the same `generateText` loop as our own marketplace tools.
 *
 * ONLY `coreAccountQueryPlugin` is registered, and that restriction is the
 * whole safety argument for this file. The kit also ships transaction plugins
 * (`coreAccountPlugin`, `coreTokenPlugin`, ... reachable via `allCorePlugins`)
 * whose tools — TRANSFER_HBAR, DELETE_ACCOUNT, token minting — move real funds
 * by calling the Hedera SDK directly. Every payment this agent makes is
 * supposed to pass through `BudgetLedger.reserve()` BEFORE it touches the
 * network (see src/tools/buy.ts), which is what makes the budget a hard cap
 * enforced by code rather than by the model choosing to behave. A kit
 * transaction tool bypasses that ledger entirely, so handing one to an
 * autonomous LLM would silently void the cap. Queries cannot spend, so they
 * compose safely with the ledger; transaction plugins must not be added here
 * without first routing them through `BudgetLedger`.
 *
 * The kit returns a plain AI-SDK ToolSet (`{type, description, inputSchema,
 * execute}`), the same shape our hand-built tools use, so this needs no
 * `wrapLanguageModel` middleware and no change to the agent loop.
 */
export function makeHederaKitTools(opts: HederaKitOptions): { tools: ToolSet; close: () => void } {
  const client = Client.forTestnet().setOperator(opts.accountId, PrivateKey.fromStringECDSA(opts.privateKeyEcdsaHex));
  const toolkit = new HederaAIToolkit({
    client,
    configuration: {
      plugins: [coreAccountQueryPlugin],
      context: { mode: AgentMode.AUTONOMOUS },
    },
  });
  return {
    tools: toolkit.getTools(),
    // The SDK Client holds open gRPC connections to testnet nodes; without
    // this the CLI process hangs after the agent finishes its report.
    close: () => client.close(),
  };
}
