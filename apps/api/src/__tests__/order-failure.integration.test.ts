import { parseUnits } from '@yieldrail/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createHarness, type Harness } from './harness';
import {
  INVESTOR_ID,
  PRODUCT_ID,
  closeHarness,
  eventTypes,
  fund,
  onboard,
  postOrder,
} from './order.helpers';

describe('subscribe order failure paths', () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    await closeHarness(harness);
    harness = undefined;
  });

  it('refunds USDC and marks REFUNDED when the mint fails', async () => {
    harness = createHarness({
      failSubmit: (_transaction, index) => index === 3,
    });
    const h = harness;
    await onboard(h);
    fund(h);

    const response = await postOrder(h, 'idem-mint-fail');
    expect(response.statusCode).toBe(502);

    const stored = h.container.orderRepository.findByIdempotencyKey(
      'idem-mint-fail',
    );
    if (!stored.ok) throw stored.error;
    if (stored.value === null) throw new Error('order was not reserved');

    expect(stored.value.status).toBe('REFUNDED');
    expect(stored.value.refundTxHash).toBe('tx-4');
    expect(h.submitted).toHaveLength(4);
    expect(eventTypes(h)).toEqual(['investor.kyc.approved', 'order.failed']);
    expect(h.eventBus.events[1]?.payload).toMatchObject({
      status: 'REFUNDED',
      code: 'CHAIN',
    });
  });

  it('moves to SUSPENSE and alerts when the refund also fails', async () => {
    harness = createHarness({
      failSubmit: (_transaction, index) => index === 3 || index === 4,
    });
    const h = harness;
    await onboard(h);
    fund(h);

    const response = await postOrder(h, 'idem-suspense');
    expect(response.statusCode).toBe(502);

    const stored = h.container.orderRepository.findByIdempotencyKey(
      'idem-suspense',
    );
    if (!stored.ok) throw stored.error;
    expect(stored.value?.status).toBe('SUSPENSE');
    expect(h.submitted).toHaveLength(4);
    expect(eventTypes(h)).toEqual(['investor.kyc.approved', 'recon.break']);
    expect(h.eventBus.events[1]?.payload).toMatchObject({
      orderId: stored.value?.id,
      message: 'Failed to submit payment',
    });
  });

  it('marks FAILED with INSUFFICIENT_FUNDS without submitting a payment', async () => {
    harness = createHarness();
    const h = harness;
    await onboard(h);
    h.setBalance(h.investor.publicKey, 'USDC', parseUnits('99'));

    const response = await postOrder(h, 'idem-insufficient');
    expect(response.statusCode).toBe(422);
    expect(h.submitted).toHaveLength(1);

    const stored = h.container.orderRepository.findByIdempotencyKey(
      'idem-insufficient',
    );
    if (!stored.ok) throw stored.error;
    expect(stored.value?.status).toBe('FAILED');
    expect(eventTypes(h)).toEqual(['investor.kyc.approved', 'order.failed']);
    expect(h.eventBus.events[1]?.payload).toMatchObject({
      status: 'FAILED',
      code: 'INSUFFICIENT_FUNDS',
    });
  });

  it('rejects a missing idempotency key and unsupported order kinds', async () => {
    harness = createHarness();
    const h = harness;
    await onboard(h);

    const noKey = await h.app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: {
        kind: 'subscribe',
        investorId: INVESTOR_ID,
        productId: PRODUCT_ID,
        usdcAmount: '100',
      },
    });
    expect(noKey.statusCode).toBe(400);

    const redeem = await h.app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { 'idempotency-key': 'idem-redeem' },
      payload: {
        kind: 'redeem',
        investorId: INVESTOR_ID,
        productId: PRODUCT_ID,
        usdcAmount: '100',
      },
    });
    expect(redeem.statusCode).toBe(400);
    expect(h.submitted).toHaveLength(1);
  });
});
