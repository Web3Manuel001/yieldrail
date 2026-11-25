import {
  AppError,
  STROOPS_PER_UNIT,
  err,
  ok,
  type NavPort,
  type Result,
} from '@yieldrail/core';

export interface MockNavOptions {
  /** NAV scaled by STROOPS_PER_UNIT. Defaults to 1.0000000. */
  readonly navScaled?: bigint;
}

/**
 * Deterministic NAV adapter for the demo. NAV starts at 1.0 and stays there
 * unless a test injects another positive value.
 */
export function createMockNavAdapter(options: MockNavOptions = {}): NavPort {
  const navScaled = options.navScaled ?? STROOPS_PER_UNIT;

  return {
    getNav(productId: string): Result<bigint, AppError> {
      const id = productId.trim();
      if (id === '') {
        return err(new AppError('VALIDATION', 'Product id is required'));
      }
      if (navScaled <= 0n) {
        return err(new AppError('INTERNAL', 'Mock NAV must be positive'));
      }
      return ok(navScaled);
    },
  };
}
