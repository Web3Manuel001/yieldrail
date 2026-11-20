import type { Result } from '../shared/result';
import type { AppError } from '../shared/errors';
import type { Stroops } from '../money/money';

export interface ChainPayment {
  txHash: string; from: string; to: string; asset: string; amount: Stroops;
}

export interface ChainPort {
  authorizeTrustline(investor: string, asset: string): Promise<Result<string, AppError>>;
  submitPayment(from: string, to: string, asset: string, amount: Stroops): Promise<Result<string, AppError>>;
  clawback(from: string, asset: string, amount: Stroops): Promise<Result<string, AppError>>;
  getBalance(account: string, asset: string): Promise<Result<Stroops, AppError>>;
  streamPayments(handler: (p: ChainPayment) => void): { stop(): void };
}
