import { describe, expect, it } from 'vitest';

import { parseUnits } from '../money/money';
import { AppError } from '../shared/errors';
import type { Result } from '../shared/result';
import { NAV_SCALE, createOrder, type CreateOrderInput } from './order';

function unwrap<T>(result: Result<T, AppError>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

function input(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    id: 'ord-001',
    idempotencyKey: 'idem-001',
    investorId: 'inv-001',
    productId: 'USTBL',
    kind: 'subscribe',
    usdcAmountMinor: parseUnits('100'),
    sharesMinor: parseUnits('99.5'),
    navScaled: NAV_SCALE,
    createdAt: '2026-11-22T10:00:00.000Z',
    ...overrides,
  };
}

describe('createOrder', () => {
  it('creates a frozen PENDING order with bigint amounts and no hashes', () => {
    const order = unwrap(createOrder(input()));

    expect(order).toEqual({
      id: 'ord-001',
      idempotencyKey: 'idem-001',
      investorId: 'inv-001',
      productId: 'USTBL',
      kind: 'subscribe',
      status: 'PENDING',
      usdcAmountMinor: 1_000_000_000n,
      sharesMinor: 995_000_000n,
      navScaled: NAV_SCALE,
      collectTxHash: null,
      mintTxHash: null,
      createdAt: '2026-11-22T10:00:00.000Z',
      updatedAt: '2026-11-22T10:00:00.000Z',
    });
    expect(Object.isFrozen(order)).toBe(true);
  });

  it('normalizes ids and rejects blank identity fields', () => {
    expect(unwrap(createOrder(input({ id: ' ord-002 ' }))).id).toBe('ord-002');

    const blankKeys = [
      { id: ' ' },
      { idempotencyKey: ' ' },
      { investorId: ' ' },
      { productId: ' ' },
    ];
    for (const overrides of blankKeys) {
      const result = createOrder(input(overrides));
      if (result.ok) throw new Error('expected order validation to fail');
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('rejects non-positive amounts and invalid timestamps', () => {
    const invalid = [
      createOrder(input({ usdcAmountMinor: parseUnits('0') })),
      createOrder(input({ sharesMinor: parseUnits('0') })),
      createOrder(input({ navScaled: 0n })),
      createOrder(input({ createdAt: 'not-a-date' })),
    ];

    for (const result of invalid) {
      if (result.ok) throw new Error('expected order validation to fail');
      expect(result.error.code).toBe('VALIDATION');
    }
  });
});
