import type { Result } from '../shared/result';
import type { AppError } from '../shared/errors';
import type { Stroops } from '../money/money';

export interface ChainPayment {
  txHash: string; from: string; to: string; asset: string; amount: Stroops;
}

/** Status of a submitted transaction, for crash-safe saga resume. */
export type TxStatus = 'success' | 'failed' | 'pending' | 'not_found';

export interface ChainPort {
  authorizeTrustline(investor: string, asset: string): Promise<Result<string, AppError>>;
  /**
   * Submit a payment. `memo` makes the leg idempotent at the chain level:
   * if a successful tx with the same source+memo already exists, return its hash
   * WITHOUT re-submitting (closes the crash-before-hash-record window).
   */
  submitPayment(from: string, to: string, asset: string, amount: Stroops, memo?: string): Promise<Result<string, AppError>>;
  clawback(from: string, asset: string, amount: Stroops): Promise<Result<string, AppError>>;
  getBalance(account: string, asset: string): Promise<Result<Stroops, AppError>>;
  /** Look up a tx by hash so a saga can resume without blindly re-paying. */
  getTransactionStatus(txHash: string): Promise<Result<TxStatus, AppError>>;
  streamPayments(handler: (p: ChainPayment) => void): { stop(): void };
}
