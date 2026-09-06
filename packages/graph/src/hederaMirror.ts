import { HEDERA_MIRROR_NODE_TESTNET } from '@bazaar/shared';

/**
 * Real, permanent, unauthenticated source of Hedera testnet transaction
 * history — verified live 2026-09-07 against `testnet.mirrornode.hedera.com`.
 * Used so the dashboard's payment history survives a redeploy of its own
 * container: the mirror node remembers every settled transaction forever,
 * a local JSONL cache does not.
 */

export interface MirrorTokenTransfer {
  token_id: string;
  account: string;
  amount: number;
  is_approval: boolean;
}

export interface MirrorTransaction {
  transaction_id: string;
  consensus_timestamp: string;
  name: string;
  result: string;
  token_transfers: MirrorTokenTransfer[];
}

interface MirrorTransactionsResponse {
  transactions: MirrorTransaction[];
  links: { next: string | null };
}

/** One leg of a token transfer, normalised to a payment-shaped record for the dashboard. */
export interface HederaTokenTransfer {
  ts: string;
  txId: string;
  result: string;
  /** the account this transfer record is "about" (the one passed to fetchHederaTokenTransfers) */
  accountId: string;
  /** positive = received, negative = sent, in the token's smallest unit */
  amount: number;
  tokenId: string;
  counterparty?: string;
}

/**
 * Fetch real settled transactions for a Hedera account, filtered to transfers
 * of a specific token (e.g. testnet USDC `0.0.429274`), from the public
 * mirror node — no API key, no local state, always reflects on-chain truth.
 */
export async function fetchHederaTokenTransfers(
  accountId: string,
  tokenId: string,
  opts: { limit?: number; fetchImpl?: typeof fetch } = {},
): Promise<HederaTokenTransfer[]> {
  const limit = opts.limit ?? 50;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${HEDERA_MIRROR_NODE_TESTNET}/api/v1/transactions?account.id=${accountId}&limit=${limit}&order=desc`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`mirror node request failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as MirrorTransactionsResponse;

  const out: HederaTokenTransfer[] = [];
  for (const tx of data.transactions) {
    const mine = tx.token_transfers.find((t) => t.token_id === tokenId && t.account === accountId);
    if (!mine) continue;
    const counterparty = tx.token_transfers.find((t) => t.token_id === tokenId && t.account !== accountId && Math.sign(t.amount) !== Math.sign(mine.amount));
    out.push({
      ts: tx.consensus_timestamp,
      txId: tx.transaction_id,
      result: tx.result,
      accountId,
      amount: mine.amount,
      tokenId,
      counterparty: counterparty?.account,
    });
  }
  return out;
}
