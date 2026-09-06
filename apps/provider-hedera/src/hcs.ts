import { AccountId, Client, PrivateKey, TopicCreateTransaction, TopicMessageSubmitTransaction } from '@hiero-ledger/sdk';
import { HEDERA_MIRROR_NODE_TESTNET, jsonlLogger } from '@bazaar/shared';

export interface Receipt {
  route: string;
  payer?: string;
  amount: string;
  asset: string;
  network: string;
  txId: string;
  briefHash?: string;
  usage?: Record<string, number>;
}

export interface ReceiptSink {
  readonly topicId: string;
  publish(receipt: Receipt): Promise<{ topicId: string; sequence?: number; mirrorUrl: string }>;
}

/** Writes each settled payment to a Hedera Consensus Service topic so anyone can audit the provider's revenue. */
export class HcsReceiptSink implements ReceiptSink {
  private constructor(private readonly client: Client, public readonly topicId: string) {}

  static async connect(opts: { accountId: string; privateKey: string; topicId?: string }): Promise<HcsReceiptSink> {
    const client = Client.forTestnet();
    const key = PrivateKey.fromStringECDSA(opts.privateKey);
    client.setOperator(AccountId.fromString(opts.accountId), key);
    let topicId = opts.topicId;
    if (!topicId) {
      const tx = await new TopicCreateTransaction().setTopicMemo('agent-bazaar x402 receipts').execute(client);
      const rc = await tx.getReceipt(client);
      topicId = rc.topicId!.toString();
      console.log(`created HCS receipt topic ${topicId} — add HCS_RECEIPT_TOPIC_ID=${topicId} to .env`);
    }
    return new HcsReceiptSink(client, topicId);
  }

  async publish(receipt: Receipt) {
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(JSON.stringify({ ts: new Date().toISOString(), ...receipt }))
      .execute(this.client);
    const rc = await tx.getReceipt(this.client);
    return { topicId: this.topicId, sequence: rc.topicSequenceNumber?.toNumber(), mirrorUrl: mirrorTopicUrl(this.topicId) };
  }
}

/** MOCK sink: appends to data/provider-hedera-receipts.jsonl by default. */
export class JsonlReceiptSink implements ReceiptSink {
  readonly topicId = 'mock-topic';
  private readonly log: ReturnType<typeof jsonlLogger>;

  constructor(log: ReturnType<typeof jsonlLogger> = jsonlLogger('provider-hedera-receipts')) {
    this.log = log;
  }

  async publish(receipt: Receipt) {
    await this.log.write({ kind: 'hcs.receipt', ...receipt });
    return { topicId: this.topicId, mirrorUrl: this.log.file };
  }
}

export function mirrorTopicUrl(topicId: string): string {
  return `${HEDERA_MIRROR_NODE_TESTNET}/api/v1/topics/${topicId}/messages`;
}
