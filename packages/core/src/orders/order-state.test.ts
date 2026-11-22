import { describe, expect, it } from 'vitest';

import { ORDER_STATUSES, type OrderStatus } from './order';
import {
  assertTransition,
  isTerminalStatus,
  isTransitionAllowed,
} from './order-state';

const LEGAL: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = [
  ['PENDING', 'COLLECTING'],
  ['PENDING', 'FAILED'],
  ['COLLECTING', 'MINTING'],
  ['COLLECTING', 'FAILED'],
  ['COLLECTING', 'REFUNDED'],
  ['MINTING', 'SETTLED'],
  ['MINTING', 'FAILED'],
  ['MINTING', 'REFUNDED'],
];

const ILLEGAL: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = [
  ['PENDING', 'MINTING'],
  ['PENDING', 'SETTLED'],
  ['PENDING', 'REFUNDED'],
  ['COLLECTING', 'PENDING'],
  ['COLLECTING', 'SETTLED'],
  ['MINTING', 'COLLECTING'],
  ['MINTING', 'PENDING'],
  ['SETTLED', 'FAILED'],
  ['SETTLED', 'REFUNDED'],
  ['FAILED', 'COLLECTING'],
  ['FAILED', 'SETTLED'],
  ['REFUNDED', 'MINTING'],
  ['REFUNDED', 'SETTLED'],
];

describe('order state machine', () => {
  it('allows the collect -> mint -> settle path and terminal outcomes', () => {
    for (const [from, to] of LEGAL) {
      expect(isTransitionAllowed(from, to)).toBe(true);
      expect(assertTransition(from, to)).toEqual({ ok: true, value: to });
    }
  });

  it('rejects every illegal transition with CONFLICT', () => {
    for (const [from, to] of ILLEGAL) {
      expect(isTransitionAllowed(from, to)).toBe(false);
      const result = assertTransition(from, to);
      if (result.ok) throw new Error(`expected ${from} -> ${to} to fail`);
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('treats SETTLED, FAILED, and REFUNDED as terminal', () => {
    for (const status of ORDER_STATUSES) {
      expect(isTerminalStatus(status)).toBe(
        status === 'SETTLED' || status === 'FAILED' || status === 'REFUNDED',
      );
    }
  });
});
