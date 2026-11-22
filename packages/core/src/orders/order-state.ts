import { AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';
import type { OrderStatus } from './order';

/**
 * Pure order state machine. PENDING collects, COLLECTING confirms the collect
 * transaction, and MINTING confirms the share mint/redemption. SETTLED, FAILED,
 * and REFUNDED are terminal.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> =
  {
    PENDING: ['COLLECTING', 'FAILED'],
    COLLECTING: ['MINTING', 'FAILED', 'REFUNDED'],
    MINTING: ['SETTLED', 'FAILED', 'REFUNDED'],
    SETTLED: [],
    FAILED: [],
    REFUNDED: [],
  };

/** Whether `to` is a legal next state from `from`. */
export function isTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Guard an order transition without side effects. Illegal transitions return
 * CONFLICT; nothing throws across the boundary.
 */
export function assertTransition(
  from: OrderStatus,
  to: OrderStatus,
): Result<OrderStatus, AppError> {
  if (!isTransitionAllowed(from, to)) {
    return err(
      new AppError('CONFLICT', `Illegal order transition: ${from} -> ${to}`),
    );
  }
  return ok(to);
}

/** Terminal statuses have no outgoing transitions. */
export function isTerminalStatus(status: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
