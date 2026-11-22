import { randomUUID } from 'node:crypto';

import {
  AppError,
  createOrder,
  err,
  isTransitionAllowed,
  ok,
  type Order,
  type OrderRepositoryPort,
  type OrderStatus,
  type ReserveOrderInput,
  type ReservedOrder,
  type Result,
  type UpdateOrderStatusPatch,
} from '@yieldrail/core';

import { mapSqliteError, type Db } from './db';
import { ORDER_COLUMNS, toOrder, type OrderRow } from './order.row';

function sameReservation(existing: Order, incoming: Order): boolean {
  return (
    existing.investorId === incoming.investorId &&
    existing.productId === incoming.productId &&
    existing.kind === incoming.kind &&
    existing.usdcAmountMinor === incoming.usdcAmountMinor &&
    existing.sharesMinor === incoming.sharesMinor &&
    existing.navScaled === incoming.navScaled
  );
}

export interface SqliteOrderRepositoryOptions {
  readonly now?: () => Date;
  readonly generateId?: () => string;
}

/** SQLite implementation of the order persistence port. */
export class SqliteOrderRepository implements OrderRepositoryPort {
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(
    private readonly db: Db,
    options: SqliteOrderRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? randomUUID;
  }

  reserve(input: ReserveOrderInput): Result<ReservedOrder, AppError> {
    const now = this.now();
    if (Number.isNaN(now.getTime())) {
      return err(new AppError('VALIDATION', 'Order clock returned an invalid date'));
    }

    const created = createOrder({
      id: this.generateId(),
      idempotencyKey: input.idempotencyKey,
      investorId: input.investorId,
      productId: input.productId,
      kind: input.kind,
      usdcAmountMinor: input.usdcAmountMinor,
      sharesMinor: input.sharesMinor,
      navScaled: input.navScaled,
      createdAt: now.toISOString(),
    });
    if (!created.ok) return created;

    const order = created.value;

    try {
      const reserve = this.db.transaction((): ReservedOrder => {
        const info = this.db
          .prepare(
            `INSERT INTO orders (${ORDER_COLUMNS})
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(idempotency_key) DO NOTHING`,
          )
          .run(
            order.id,
            order.idempotencyKey,
            order.investorId,
            order.productId,
            order.kind,
            order.status,
            order.usdcAmountMinor,
            order.sharesMinor,
            order.navScaled,
            order.collectTxHash,
            order.mintTxHash,
            order.createdAt,
            order.updatedAt,
          );

        if (info.changes === 1) {
          return { order, created: true };
        }

        const existingRow = this.db
          .prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE idempotency_key = ?`)
          .get(order.idempotencyKey) as OrderRow | undefined;
        if (existingRow === undefined) {
          throw new AppError(
            'CONFLICT',
            'Order idempotency conflict without an existing order',
          );
        }

        const existing = toOrder(existingRow);
        if (!sameReservation(existing, order)) {
          throw new AppError(
            'CONFLICT',
            'Idempotency key was reused for a different order',
          );
        }

        return { order: existing, created: false };
      });

      return ok(reserve());
    } catch (error) {
      return err(mapSqliteError(error));
    }
  }

  updateStatus(
    id: string,
    status: OrderStatus,
    patch: UpdateOrderStatusPatch = {},
  ): Result<Order, AppError> {
    const collectTxHash = patch.collectTxHash?.trim();
    const mintTxHash = patch.mintTxHash?.trim();
    if (collectTxHash === '' || mintTxHash === '') {
      return err(
        new AppError('VALIDATION', 'Order transaction hash cannot be blank'),
      );
    }

    try {
      const update = this.db.transaction((): Order => {
        const currentRow = this.findByIdRow(id);
        if (currentRow === undefined) {
          throw new AppError('NOT_FOUND', `Order not found: ${id}`);
        }

        const current = toOrder(currentRow);
        if (!isTransitionAllowed(current.status, status)) {
          throw new AppError(
            'CONFLICT',
            `Illegal order transition: ${current.status} -> ${status}`,
          );
        }

        const now = this.now();
        if (Number.isNaN(now.getTime())) {
          throw new AppError('VALIDATION', 'Order clock returned an invalid date');
        }

        this.db
          .prepare(
            `UPDATE orders
                SET status = ?,
                    collect_tx_hash = COALESCE(?, collect_tx_hash),
                    mint_tx_hash = COALESCE(?, mint_tx_hash),
                    updated_at = ?
              WHERE id = ?`,
          )
          .run(
            status,
            collectTxHash ?? null,
            mintTxHash ?? null,
            now.toISOString(),
            id,
          );

        const updatedRow = this.findByIdRow(id);
        if (updatedRow === undefined) {
          throw new AppError('INTERNAL', `Order disappeared after update: ${id}`);
        }
        return toOrder(updatedRow);
      });

      return ok(update());
    } catch (error) {
      return err(mapSqliteError(error));
    }
  }

  findByIdempotencyKey(
    idempotencyKey: string,
  ): Result<Order | null, AppError> {
    try {
      const row = this.db
        .prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE idempotency_key = ?`)
        .get(idempotencyKey) as OrderRow | undefined;
      return ok(row === undefined ? null : toOrder(row));
    } catch (error) {
      return err(mapSqliteError(error));
    }
  }

  private findByIdRow(id: string): OrderRow | undefined {
    return this.db
      .prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?`)
      .get(id) as OrderRow | undefined;
  }
}
