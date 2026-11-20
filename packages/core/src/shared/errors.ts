export type ErrorCode =
  | 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'IDEMPOTENCY'
  | 'INSUFFICIENT_FUNDS' | 'KYC_REJECTED' | 'LEDGER_UNBALANCED'
  | 'CHAIN' | 'INTERNAL';

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public cause?: unknown) {
    super(message);
    this.name = 'AppError';
  }
}
