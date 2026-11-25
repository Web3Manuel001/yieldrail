import type { Stroops } from '../money/money';
import type { Order, OrderKind, OrderStatus } from '../orders/order';
import type { AppError } from '../shared/errors';
import type { Result } from '../shared/result';

/** Everything needed to reserve a new order; id and timestamps are generated. */
export interface ReserveOrderInput {
  readonly kind: OrderKind;
  readonly investorId: string;
  readonly productId: string;
  readonly usdcAmountMinor: Stroops;
  readonly sharesMinor: Stroops;
  readonly navScaled: bigint;
  readonly remainderMinor: bigint;
}

export interface ReservedOrder {
  readonly order: Order;
  /** False when the idempotency key already reserved an order. */
  readonly created: boolean;
}

export interface UpdateOrderStatusPatch {
  readonly collectTxHash?: string;
  readonly mintTxHash?: string;
  readonly refundTxHash?: string;
}

/** Persistence boundary for order orchestration. */
export interface OrderRepositoryPort {
  /**
   * Atomically create a PENDING order. A repeated idempotency key returns the
   * original order with `created: false`; reusing a key for a different
   * investor/product/kind/amount is a CONFLICT.
   */
  reserve(
    idempotencyKey: string,
    input: ReserveOrderInput,
  ): Result<ReservedOrder, AppError>;

  /**
   * Advance the order through the state machine, optionally recording hashes.
   * Repeating the current status patches hashes without a transition.
   */
  updateStatus(
    id: string,
    status: OrderStatus,
    patch?: UpdateOrderStatusPatch,
  ): Result<Order, AppError>;

  findById(id: string): Result<Order | null, AppError>;

  findByIdempotencyKey(
    idempotencyKey: string,
  ): Result<Order | null, AppError>;
}
