import type { Transaction } from '@stellar/stellar-sdk';

/** Subset of a Horizon balance line needed for asset balance lookups. */
export interface AccountBalance {
  readonly asset_type: string;
  readonly asset_code?: string;
  readonly asset_issuer?: string;
  readonly balance: string;
  readonly is_authorized?: boolean;
}

export interface AccountSnapshot {
  sequenceNumber(): string;
  readonly balances?: readonly AccountBalance[];
}

export interface SubmittedTransaction {
  readonly hash: string;
}

/** Minimal Horizon transaction record used for status and memo lookups. */
export interface HorizonTransactionRecord {
  readonly hash: string;
  readonly successful?: boolean;
  readonly source_account?: string;
  readonly memo?: string;
  readonly memo_type?: string;
}

export interface AccountTransactionsOptions {
  readonly limit?: number;
  readonly order?: 'asc' | 'desc';
}

/**
 * Minimal Horizon surface used by transaction operations. Keeping this narrow
 * makes the operations independent of the full SDK and easy to mock in tests.
 * Transaction lookup methods are optional because mocks and older callers only
 * need account loads and submissions.
 */
export interface HorizonGateway {
  loadAccount(publicKey: string): Promise<AccountSnapshot>;
  submitTransaction(transaction: Transaction): Promise<SubmittedTransaction>;
  getTransaction?(hash: string): Promise<HorizonTransactionRecord>;
  getAccountTransactions?(
    account: string,
    options?: AccountTransactionsOptions,
  ): Promise<readonly HorizonTransactionRecord[]>;
}
