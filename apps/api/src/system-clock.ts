import type { ClockPort } from '@yieldrail/core';

/** Production clock. Injected everywhere; the domain never calls Date.now(). */
export const systemClock: ClockPort = {
  now: () => new Date(),
};
