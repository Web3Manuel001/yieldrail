import type { Order } from '../orders/order';
import type { DomainEvent } from '../ports/event-bus.port';
import { AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';
import type {
  OrderFailedPayload,
  OrderSettledPayload,
  ReconBreakPayload,
  SubscribeOrderDeps,
  SubscribeOrderResult,
} from './subscribe.order';

const USDC = 'USDC';
const USTBL = 'USTBL';
async function collect(
  deps: SubscribeOrderDeps,
  order: Order,
  wallet: string,
): Promise<Result<Order, AppError>> {
  const balance = await deps.chain.getBalance(wallet, USDC);
  if (!balance.ok) return balance;
  if (balance.value < order.usdcAmountMinor) {
    return fail(
      deps,
      order,
      new AppError('INSUFFICIENT_FUNDS', 'Investor has insufficient USDC'),
    );
  }

  const paid = await deps.chain.submitPayment(
    wallet,
    deps.issuerAddress,
    USDC,
    order.usdcAmountMinor,
  );
  if (!paid.ok) return fail(deps, order, paid.error);

  return deps.orders.updateStatus(order.id, 'COLLECTING', {
    collectTxHash: paid.value,
  });
}
async function mint(
  deps: SubscribeOrderDeps,
  order: Order,
  wallet: string,
): Promise<Result<Order, AppError>> {
  if (order.collectTxHash === null) {
    return err(
      new AppError('CONFLICT', 'Order is COLLECTING without a collect hash'),
    );
  }

  const supply = await deps.chain.getBalance(deps.issuerAddress, USTBL);
  if (!supply.ok) return supply;
  if (supply.value < order.sharesMinor) {
    return refund(
      deps,
      order,
      wallet,
      new AppError('INSUFFICIENT_FUNDS', 'Issuer has insufficient USTBL'),
    );
  }

  const minted = await deps.chain.submitPayment(
    deps.issuerAddress,
    wallet,
    USTBL,
    order.sharesMinor,
  );
  if (!minted.ok) return refund(deps, order, wallet, minted.error);

  return deps.orders.updateStatus(order.id, 'MINTING', {
    mintTxHash: minted.value,
  });
}
async function settle(
  deps: SubscribeOrderDeps,
  order: Order,
): Promise<Result<SubscribeOrderResult, AppError>> {
  if (order.mintTxHash === null) {
    return err(new AppError('CONFLICT', 'Order is MINTING without a mint hash'));
  }

  const now = deps.clock.now();
  if (Number.isNaN(now.getTime())) {
    return err(new AppError('INTERNAL', 'Clock returned an invalid date'));
  }

  const posted = deps.ledger.postSubscribe({
    orderId: order.id,
    investorId: order.investorId,
    productId: order.productId,
    usdcAmountMinor: order.usdcAmountMinor,
    sharesMinor: order.sharesMinor,
    effectiveDate: now.toISOString().slice(0, 10),
  });
  if (!posted.ok) return posted;

  const settled = deps.orders.updateStatus(order.id, 'SETTLED');
  if (!settled.ok) return settled;

  const event: DomainEvent<'order.settled', OrderSettledPayload> = {
    type: 'order.settled',
    occurredAt: now.toISOString(),
    payload: {
      orderId: settled.value.id,
      investorId: settled.value.investorId,
      productId: settled.value.productId,
      usdcAmountMinor: settled.value.usdcAmountMinor.toString(),
      sharesMinor: settled.value.sharesMinor.toString(),
      navScaled: settled.value.navScaled.toString(),
      collectTxHash: settled.value.collectTxHash ?? '',
      mintTxHash: settled.value.mintTxHash ?? '',
    },
  };

  try {
    await deps.events.publish(event);
  } catch (error) {
    return err(
      new AppError('INTERNAL', 'Failed to publish order.settled', error),
    );
  }

  return ok({ order: settled.value });
}
async function fail(
  deps: SubscribeOrderDeps,
  order: Order,
  cause: AppError,
): Promise<Result<Order, AppError>> {
  const failed = deps.orders.updateStatus(order.id, 'FAILED');
  if (!failed.ok) return failed;

  await publishFailure(deps, failed.value, 'FAILED', cause);
  return err(cause);
}
async function refund(
  deps: SubscribeOrderDeps,
  order: Order,
  wallet: string,
  cause: AppError,
): Promise<Result<Order, AppError>> {
  const refunded = await deps.chain.submitPayment(
    deps.issuerAddress,
    wallet,
    USDC,
    order.usdcAmountMinor,
  );

  if (refunded.ok) {
    const updated = deps.orders.updateStatus(order.id, 'REFUNDED', {
      refundTxHash: refunded.value,
    });
    if (!updated.ok) return updated;

    await publishFailure(deps, updated.value, 'REFUNDED', cause);
    return err(cause);
  }

  const suspended = deps.orders.updateStatus(order.id, 'SUSPENSE');
  if (!suspended.ok) return suspended;

  await publishReconBreak(deps, suspended.value, cause);
  return err(
    new AppError(
      'CHAIN',
      'Mint failed and the USDC refund could not be submitted',
      refunded.error,
    ),
  );
}

async function publishFailure(
  deps: SubscribeOrderDeps,
  order: Order,
  status: 'FAILED' | 'REFUNDED',
  cause: AppError,
): Promise<void> {
  const event: DomainEvent<'order.failed', OrderFailedPayload> = {
    type: 'order.failed',
    occurredAt: deps.clock.now().toISOString(),
    payload: {
      orderId: order.id,
      investorId: order.investorId,
      productId: order.productId,
      status,
      code: cause.code,
      message: cause.message,
    },
  };

  try {
    await deps.events.publish(event);
  } catch {
    // The outcome is persisted; losing the notification must not change it.
  }
}

async function publishReconBreak(
  deps: SubscribeOrderDeps,
  order: Order,
  cause: AppError,
): Promise<void> {
  const event: DomainEvent<'recon.break', ReconBreakPayload> = {
    type: 'recon.break',
    occurredAt: deps.clock.now().toISOString(),
    payload: {
      orderId: order.id,
      investorId: order.investorId,
      usdcAmountMinor: order.usdcAmountMinor.toString(),
      message: cause.message,
    },
  };

  try {
    await deps.events.publish(event);
  } catch {
    // The SUSPENSE row is the durable reconciliation signal.
  }
}

/** Resume the compensatable saga from the order's persisted status. */
export async function runSubscribeSaga(
  deps: SubscribeOrderDeps,
  order: Order,
  wallet: string,
): Promise<Result<SubscribeOrderResult, AppError>> {
  let current = order;

  if (current.status === 'PENDING') {
    const collected = await collect(deps, current, wallet);
    if (!collected.ok) return collected;
    current = collected.value;
  }

  if (current.status === 'COLLECTING') {
    const minted = await mint(deps, current, wallet);
    if (!minted.ok) return minted;
    current = minted.value;
  }

  if (current.status === 'MINTING') return settle(deps, current);
  if (current.status === 'SETTLED') return ok({ order: current });

  return err(
    new AppError('CONFLICT', `Order cannot resume from ${current.status}`),
  );
}
