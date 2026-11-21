import type { Transaction } from '@stellar/stellar-sdk';

export interface AccountSnapshot {
  sequenceNumber(): string;
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
