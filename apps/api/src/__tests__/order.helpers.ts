import { parseUnits } from '@yieldrail/core';

import { postOnboard, type Harness } from './harness';

export const INVESTOR_ID = 'inv-001';
export const PRODUCT_ID = 'USTBL';

export interface OrderDto {
  id: string;
  status: string;
  usdcAmountMinor: string;
  sharesMinor: string;
  navScaled: string;
  remainderMinor: string;
  collectTxHash: string | null;
  mintTxHash: string | null;
  refundTxHash: string | null;
}

export function postOrder(
  harness: Harness,
  idempotencyKey: string,
  usdcAmount = '100',
) {
  return harness.app.inject({
    method: 'POST',
    url: '/v1/orders',
    headers: { 'idempotency-key': idempotencyKey },
    payload: {
      kind: 'subscribe',
      investorId: INVESTOR_ID,
      productId: PRODUCT_ID,
      usdcAmount,
    },
  });
}

export function orderOf(response: { json(): unknown }): OrderDto {
  return (response.json() as { order: OrderDto }).order;
}

export async function onboard(harness: Harness): Promise<void> {
  const response = await postOnboard(harness, {
    investorId: INVESTOR_ID,
    wallet: harness.investor.publicKey,
    jurisdiction: 'NG',
    productId: PRODUCT_ID,
  });
  if (response.statusCode !== 200) {
    throw new Error(`onboarding failed: ${response.body}`);
  }
}

export function fund(harness: Harness): void {
  harness.setBalance(harness.investor.publicKey, 'USDC', parseUnits('100'));
  harness.setBalance(harness.issuer.publicKey, 'USTBL', parseUnits('100'));
}

export function eventTypes(harness: Harness): string[] {
  return harness.eventBus.events.map((event) => event.type);
}

export async function closeHarness(harness: Harness | undefined): Promise<void> {
  if (harness === undefined) return;
  await harness.app.close();
  harness.container.close();
}
