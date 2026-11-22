import {
  AppError,
  isOrderKind,
  isOrderStatus,
  stroops,
  type Order,
} from '@yieldrail/core';

/** Row shape returned by better-sqlite3 with defaultSafeIntegers enabled. */
export interface OrderRow {
  id: string;
  idempotency_key: string;
  investor_id: string;
  product_id: string;
  kind: string;
  status: string;
  usdc_amount_minor: bigint;
  shares_minor: bigint;
  nav_scaled: bigint;
  collect_tx_hash: string | null;
  mint_tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

export const ORDER_COLUMNS = `id, idempotency_key, investor_id, product_id, kind, status,
  usdc_amount_minor, shares_minor, nav_scaled, collect_tx_hash, mint_tx_hash,
  created_at, updated_at`;

/** Convert a database row into the frozen domain entity. */
export function toOrder(row: OrderRow): Order {
  if (!isOrderKind(row.kind)) {
    throw new AppError('INTERNAL', `Unknown order kind: ${row.kind}`);
  }
  if (!isOrderStatus(row.status)) {
    throw new AppError('INTERNAL', `Unknown order status: ${row.status}`);
  }

  return Object.freeze({
    id: row.id,
    idempotencyKey: row.idempotency_key,
    investorId: row.investor_id,
    productId: row.product_id,
    kind: row.kind,
    status: row.status,
    usdcAmountMinor: stroops(row.usdc_amount_minor),
    sharesMinor: stroops(row.shares_minor),
    navScaled: row.nav_scaled,
    collectTxHash: row.collect_tx_hash,
    mintTxHash: row.mint_tx_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
