import { STROOPS_PER_UNIT } from '@yieldrail/core';
import { describe, expect, it } from 'vitest';

import { createMockNavAdapter } from './mock-nav.adapter';

describe('mock NAV adapter', () => {
  it('starts at 1.0 (STROOPS_PER_UNIT)', () => {
    const nav = createMockNavAdapter();
    const result = nav.getNav('USTBL');
    if (!result.ok) throw result.error;
    expect(result.value).toBe(STROOPS_PER_UNIT);
  });

  it('returns an injected NAV and rejects blank product ids', () => {
    const nav = createMockNavAdapter({ navScaled: 10_500_000n });
    const result = nav.getNav('USTBL');
    if (!result.ok) throw result.error;
    expect(result.value).toBe(10_500_000n);

    const blank = nav.getNav(' ');
    if (blank.ok) throw new Error('expected blank product to fail');
    expect(blank.error.code).toBe('VALIDATION');
  });
});
