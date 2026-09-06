import { tool } from 'ai';
import { z } from 'zod';
import type { BudgetLedger } from '../ledger.js';

export function makeBudgetStatusTool(ledger: BudgetLedger) {
  return tool({
    description: 'Check the current budget status: how much has been spent, how much remains, and every settled receipt so far. Call before deciding whether another paid call is affordable.',
    inputSchema: z.object({}),
    execute: async () => ledger.status(),
  });
}
