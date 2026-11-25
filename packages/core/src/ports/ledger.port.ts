import type { Stroops } from '../money/money';
import type { AppError } from '../shared/errors';
import type { Result } from '../shared/result';

export interface PostSubscribeLedgerInput {
  readonly orderId: string;
  readonly investorId: string;
  readonly productId: string;
  readonly usdcAmountMinor: Stroops;
  readonly sharesMinor: Stroops;
  /** Accounting effective date (YYYY-MM-DD). */
  readonly effectiveDate: string;
}

/** Ledger boundary for order settlement. */
export interface LedgerPort {
  /**
   * Two balanced legs: investor cash / issuer clearing in USDC, and investor
   * position / issuer clearing in USTBL. Must be idempotent per order.
   */
  postSubscribe(input: PostSubscribeLedgerInput): Result<void, AppError>;
}
