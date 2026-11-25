import { parseUnits } from '@yieldrail/core';
import { createMockNavAdapter } from '@yieldrail/nav-mock';
import { afterEach, describe, expect, it } from 'vitest';

import { createHarness, type Harness, type HarnessOptions } from './harness';
import {
  INVESTOR_ID,
  PRODUCT_ID,
  closeHarness,
  eventTypes,
  fund,
  onboard,
  orderOf,
  postOrder,
} from './order.helpers';

describe('subscribe order API', () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    await closeHarness(harness);
    harness = undefined;
  });

  function start(options: HarnessOptions = {}): Harness {
    harness = createHarness(options);
    return harness;
  }

  it('collects USDC, mints USTBL, settles, and emits order.settled', async () => {
    const h = start();
    await onboard(h);
    fund(h);

    const response = await postOrder(h, 'idem-happy');
    expect(response.statusCode).toBe(200);

    const order = orderOf(response);
    expect(order).toMatchObject({
      status: 'SETTLED',
      usdcAmountMinor: '1000000000',
      sharesMinor: '1000000000',
      navScaled: '10000000',
      remainderMinor: '0',
      collectTxHash: 'tx-2',
      mintTxHash: 'tx-3',
      refundTxHash: null,
    });

    expect(h.submitted).toHaveLength(3);
    expect(eventTypes(h)).toEqual(['investor.kyc.approved', 'order.settled']);

    const fetched = await h.app.inject({
      method: 'GET',
      url: `/v1/orders/${order.id}`,
    });
    expect(fetched.statusCode).toBe(200);
    expect(orderOf(fetched)).toEqual(order);
  });

  it('prices shares from NAV and stores the rounding remainder', async () => {
    const h = start({
      navPort: createMockNavAdapter({ navScaled: 10_500_000n }),
    });
    await onboard(h);
    fund(h);

    const response = await postOrder(h, 'idem-nav');
    expect(response.statusCode).toBe(200);

    expect(orderOf(response)).toMatchObject({
      status: 'SETTLED',
      sharesMinor: '952380952',
      navScaled: '10500000',
      remainderMinor: '4000000',
    });
  });

  it('replays an idempotency key without a second collect or mint', async () => {
    const h = start();
    await onboard(h);
    fund(h);

    const first = await postOrder(h, 'idem-replay');
    const second = await postOrder(h, 'idem-replay');

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(h.submitted).toHaveLength(3);
    expect(
      eventTypes(h).filter((type) => type === 'order.settled'),
    ).toHaveLength(1);
  });

  it('resumes a COLLECTING order without paying the investor leg again', async () => {
    const h = start();
    await onboard(h);
    h.setBalance(h.issuer.publicKey, 'USTBL', parseUnits('100'));

    const usdcAmountMinor = parseUnits('100');
    const reserved = h.container.orderRepository.reserve('idem-resume', {
      kind: 'subscribe',
      investorId: INVESTOR_ID,
      productId: PRODUCT_ID,
      usdcAmountMinor,
      sharesMinor: usdcAmountMinor,
      navScaled: 10_000_000n,
      remainderMinor: 0n,
    });
    if (!reserved.ok) throw reserved.error;

    const collecting = h.container.orderRepository.updateStatus(
      reserved.value.order.id,
      'COLLECTING',
      { collectTxHash: 'prior-collect' },
    );
    if (!collecting.ok) throw collecting.error;

    const response = await postOrder(h, 'idem-resume');
    expect(response.statusCode).toBe(200);

    const order = orderOf(response);
    expect(order.status).toBe('SETTLED');
    expect(order.collectTxHash).toBe('prior-collect');
    expect(order.mintTxHash).toBe('tx-2');
    expect(h.submitted).toHaveLength(2);
  });

  it('requires an existing, eligible investor', async () => {
    const h = start();

    const missing = await postOrder(h, 'idem-missing');
    expect(missing.statusCode).toBe(404);
    expect(h.submitted).toHaveLength(0);

    await onboard(h);
    const wrongProduct = await h.app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { 'idempotency-key': 'idem-wrong-product' },
      payload: {
        kind: 'subscribe',
        investorId: INVESTOR_ID,
        productId: 'USTBL-GH',
        usdcAmount: '100',
      },
    });
    expect(wrongProduct.statusCode).toBe(403);
    expect(h.submitted).toHaveLength(1);
  });
});
