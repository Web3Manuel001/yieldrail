import type { Order } from '../orders/order';
import type { DomainEvent } from '../ports/event-bus.port';
import type { AppError } from '../shared/errors';
import type {
  OrderFailedPayload,
  ReconBreakPayload,
  SubscribeOrderDeps,
} from './subscribe.order';

export async function publishFailure(
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

export async function publishReconBreak(
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
