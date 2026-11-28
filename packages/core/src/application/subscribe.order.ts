import {
  STROOPS_PER_UNIT,
  mulDivRoundDown,
  stroops,
  type Stroops,
} from '../money/money';
import type { Order } from '../orders/order';
import { isTerminalStatus } from '../orders/order-state';
import type { ChainPort } from '../ports/chain.port';
import type { ClockPort } from '../ports/clock.port';
import type { EventBusPort } from '../ports/event-bus.port';
import type { InvestorLookupPort } from '../ports/investor-lookup.port';
import type { InvestorRepositoryPort } from '../ports/investor.repository.port';
import type { LedgerPort } from '../ports/ledger.port';
import type { NavPort } from '../ports/nav.port';
import type { OrderRepositoryPort } from '../ports/order.repository.port';
import { AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';
import { runSubscribeSaga } from './subscribe.saga';

export interface SubscribeOrderInput {
  readonly idempotencyKey: string;
  readonly investorId: string;
  readonly productId: string;
  readonly usdcAmountMinor: Stroops;
}

export interface SubscribeOrderResult {
  readonly order: Order;
}

export interface OrderSettledPayload {
  readonly orderId: string;
  readonly investorId: string;
  readonly productId: string;
  readonly usdcAmountMinor: string;
  readonly sharesMinor: string;
  readonly navScaled: string;
  readonly collectTxHash: string;
  readonly mintTxHash: string;
}

export interface OrderFailedPayload {
  readonly orderId: string;
  readonly investorId: string;
  readonly productId: string;
  readonly status: 'FAILED' | 'REFUNDED';
  readonly code: string;
  readonly message: string;
}

export interface ReconBreakPayload {
  readonly orderId: string;
  readonly investorId: string;
  readonly usdcAmountMinor: string;
  readonly message: string;
}

export interface SubscribeOrderDeps {
  readonly orders: OrderRepositoryPort;
  readonly investors: InvestorRepositoryPort;
  readonly investorLookup: InvestorLookupPort;
  readonly nav: NavPort;
  readonly chain: ChainPort;
  readonly ledger: LedgerPort;
  readonly events: EventBusPort;
  readonly clock: ClockPort;
  /** Stellar account that receives USDC and pays out USTBL. */
  readonly issuerAddress: string;
}

/**
 * Subscribe use-case: validate the investor, price the order, reserve the
 * idempotency key, then run the compensatable collect -> mint -> ledger saga.
 * A settled replay returns the stored order without repeating money movement.
 */
export class SubscribeOrder {
  constructor(private readonly deps: SubscribeOrderDeps) {}

  async execute(
    input: SubscribeOrderInput,
  ): Promise<Result<SubscribeOrderResult, AppError>> {
    if (input.usdcAmountMinor <= 0n) {
      return err(new AppError('VALIDATION', 'USDC amount must be positive'));
    }

    const investorResult = this.deps.investorLookup.findById(input.investorId);
    if (!investorResult.ok) return investorResult;
    if (investorResult.value === null) {
      return err(
        new AppError('NOT_FOUND', `Investor not found: ${input.investorId}`),
      );
    }
    const investor = investorResult.value;

    const eligibility = this.deps.investors.findEligibility(
      investor.id,
      input.productId,
    );
    if (!eligibility.ok) return eligibility;
    if (eligibility.value === null) {
      return err(
        new AppError(
          'KYC_REJECTED',
          `Investor is not eligible for ${input.productId}`,
        ),
      );
    }

    const navResult = this.deps.nav.getNav(input.productId);
    if (!navResult.ok) return navResult;
    if (navResult.value <= 0n) {
      return err(new AppError('INTERNAL', 'NAV must be positive'));
    }

    const priced = mulDivRoundDown(
      input.usdcAmountMinor,
      STROOPS_PER_UNIT,
      navResult.value,
    );
    if (priced.result <= 0n) {
      return err(new AppError('VALIDATION', 'USDC amount is below one share'));
    }

    const reserved = this.deps.orders.reserve(input.idempotencyKey, {
      kind: 'subscribe',
      investorId: investor.id,
      productId: input.productId,
      usdcAmountMinor: input.usdcAmountMinor,
      sharesMinor: stroops(priced.result),
      navScaled: navResult.value,
      remainderMinor: priced.remainder,
    });
    if (!reserved.ok) return reserved;

    const order = reserved.value.order;
    if (!reserved.value.created) {
      if (order.status === 'SETTLED') return ok({ order });
      if (isTerminalStatus(order.status)) {
        return err(
          new AppError('CONFLICT', `Order already finished as ${order.status}`),
        );
      }
    }

    return runSubscribeSaga(
      this.deps,
      order,
      investor.walletAddress,
      !reserved.value.created,
    );
  }
}
