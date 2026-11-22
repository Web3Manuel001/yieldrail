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
  hash: string;
}

/**
 * Minimal Horizon surface used by transaction operations. Keeping this narrow
 * makes the operations independent of the full SDK and easy to mock in tests.
 */
export interface HorizonGateway {
  loadAccount(publicKey: string): Promise<AccountSnapshot>;
  submitTransaction(transaction: Transaction): Promise<SubmittedTransaction>;
}
