import { stroops, type Stroops } from '../money/money';
import { AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';

/** Order side: investors subscribe USDC into the fund, or redeem shares. */
export const ORDER_KINDS = ['subscribe', 'redeem'] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];

/**
 * Order lifecycle. PENDING collects the investor leg, COLLECTING holds the
 * collect transaction, MINTING holds the mint/redemption transaction, and the
 * remaining statuses are terminal outcomes. SUSPENSE means a compensation
 * failed and reconciliation must resolve it manually.
 */
export const ORDER_STATUSES = [
  'PENDING',
  'COLLECTING',
  'MINTING',
  'SETTLED',
  'FAILED',
  'REFUNDED',
  'SUSPENSE',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly investorId: string;
  readonly productId: string;
  readonly kind: OrderKind;
  readonly status: OrderStatus;
  readonly usdcAmountMinor: Stroops;
  readonly sharesMinor: Stroops;
  readonly navScaled: bigint;
  readonly remainderMinor: bigint;
  readonly collectTxHash: string | null;
  readonly mintTxHash: string | null;
  readonly refundTxHash: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateOrderInput {
  id: string;
  idempotencyKey: string;
  investorId: string;
  productId: string;
  kind: OrderKind;
  usdcAmountMinor: Stroops;
  sharesMinor: Stroops;
  navScaled: bigint;
  remainderMinor: bigint;
  createdAt: string;
}

export function isOrderKind(value: string): value is OrderKind {
  return (ORDER_KINDS as readonly string[]).includes(value);
}

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/**
 * Build a validated, frozen order in PENDING. Pure: the caller supplies the id
 * and timestamp; the repository owns generation and persistence.
 */
export function createOrder(input: CreateOrderInput): Result<Order, AppError> {
  const id = input.id.trim();
  if (id === '') {
    return err(new AppError('VALIDATION', 'Order id is required'));
  }

  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey === '') {
    return err(new AppError('VALIDATION', 'Order idempotency key is required'));
  }

  const investorId = input.investorId.trim();
  if (investorId === '') {
    return err(new AppError('VALIDATION', 'Order investor id is required'));
  }

  const productId = input.productId.trim();
  if (productId === '') {
    return err(new AppError('VALIDATION', 'Order product id is required'));
  }

  if (!isOrderKind(input.kind)) {
    return err(new AppError('VALIDATION', 'Unknown order kind'));
  }

  if (input.usdcAmountMinor <= 0n) {
    return err(new AppError('VALIDATION', 'Order USDC amount must be positive'));
  }

  if (input.sharesMinor <= 0n) {
    return err(new AppError('VALIDATION', 'Order shares amount must be positive'));
  }

  if (input.navScaled <= 0n) {
    return err(new AppError('VALIDATION', 'Order NAV must be positive'));
  }

  if (input.remainderMinor < 0n) {
    return err(new AppError('VALIDATION', 'Order remainder cannot be negative'));
  }

  const createdAt = new Date(input.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    return err(new AppError('VALIDATION', 'Order creation timestamp is invalid'));
  }
  const createdAtIso = createdAt.toISOString();

  return ok(
    Object.freeze({
      id,
      idempotencyKey,
      investorId,
      productId,
      kind: input.kind,
      status: 'PENDING',
      usdcAmountMinor: stroops(input.usdcAmountMinor),
      sharesMinor: stroops(input.sharesMinor),
      navScaled: input.navScaled,
      remainderMinor: input.remainderMinor,
      collectTxHash: null,
      mintTxHash: null,
      refundTxHash: null,
      createdAt: createdAtIso,
      updatedAt: createdAtIso,
    }),
  );
}
