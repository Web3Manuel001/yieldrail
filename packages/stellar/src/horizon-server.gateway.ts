import type { Horizon, Transaction } from '@stellar/stellar-sdk';

import type {
  AccountSnapshot,
  AccountTransactionsOptions,
  HorizonGateway,
  HorizonTransactionRecord,
  SubmittedTransaction,
} from './gateway';

interface HorizonRecordLike {
  readonly hash: string;
  readonly successful?: boolean;
  readonly source_account?: string;
  readonly memo?: string;
  readonly memo_type?: string;
}

function toRecord(record: HorizonRecordLike): HorizonTransactionRecord {
  return {
    hash: record.hash,
    ...(record.successful === undefined
      ? {}
      : { successful: record.successful }),
    ...(record.source_account === undefined
      ? {}
      : { source_account: record.source_account }),
    ...(record.memo_type === undefined ? {} : { memo_type: record.memo_type }),
    ...(record.memo === undefined ? {} : { memo: record.memo }),
  };
}

/**
 * Adapt the full Horizon server to the narrow, mockable gateway. Transaction
 * lookup is exposed as plain methods so operations never depend on the SDK's
 * call-builder surface.
 */
export class HorizonServerGateway implements HorizonGateway {
  constructor(private readonly server: Horizon.Server) {}

  loadAccount(publicKey: string): Promise<AccountSnapshot> {
    return this.server.loadAccount(publicKey);
  }

  submitTransaction(transaction: Transaction): Promise<SubmittedTransaction> {
    return this.server.submitTransaction(transaction);
  }

  async getTransaction(hash: string): Promise<HorizonTransactionRecord> {
    const record = await this.server.transactions().transaction(hash).call();
    return toRecord(record);
  }

  async getAccountTransactions(
    account: string,
    options: AccountTransactionsOptions = {},
  ): Promise<readonly HorizonTransactionRecord[]> {
    let builder = this.server.transactions().forAccount(account);
    if (options.order !== undefined) builder = builder.order(options.order);
    if (options.limit !== undefined) builder = builder.limit(options.limit);

    const page = await builder.call();
    return page.records.map(toRecord);
  }
}
