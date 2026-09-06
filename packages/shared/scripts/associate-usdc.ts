/**
 * Associate the Hedera testnet USDC token (0.0.429274) with an account so it can
 * receive x402 USDC payments. Idempotent.
 *
 *   pnpm --filter @bazaar/shared associate-usdc -- <accountId> <ecdsaPrivateKeyHex>
 * or set HEDERA_ACCOUNT_ID / HEDERA_PRIVATE_KEY.
 */
import { AccountId, Client, PrivateKey, TokenAssociateTransaction, TokenId } from '@hiero-ledger/sdk';
import { HEDERA_USDC_TESTNET } from '../src/x402.js';

const accountIdStr = process.argv[2] ?? process.env.HEDERA_ACCOUNT_ID;
const keyStr = process.argv[3] ?? process.env.HEDERA_PRIVATE_KEY;
if (!accountIdStr || !keyStr) {
  console.error('usage: associate-usdc <accountId> <ecdsaPrivateKeyHex>');
  process.exit(1);
}

const client = Client.forTestnet();
const key = PrivateKey.fromStringECDSA(keyStr);
client.setOperator(AccountId.fromString(accountIdStr), key);

try {
  const tx = await new TokenAssociateTransaction()
    .setAccountId(AccountId.fromString(accountIdStr))
    .setTokenIds([TokenId.fromString(HEDERA_USDC_TESTNET)])
    .freezeWith(client)
    .sign(key);
  const res = await tx.execute(client);
  const receipt = await res.getReceipt(client);
  console.log(`associated ${HEDERA_USDC_TESTNET} with ${accountIdStr}: ${receipt.status.toString()}`);
  console.log(`https://hashscan.io/testnet/transaction/${res.transactionId.toString()}`);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT')) {
    console.log(`already associated: ${accountIdStr}`);
  } else {
    console.error(msg);
    process.exit(1);
  }
} finally {
  client.close();
}
