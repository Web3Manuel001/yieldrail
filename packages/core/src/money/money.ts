/** Stellar stroops: 1 unit = 10_000_000 stroops (7 decimals). bigint ONLY. */
export type Stroops = bigint & { readonly __brand: 'Stroops' };
export const STROOPS_PER_UNIT = 10_000_000n;

export function stroops(n: bigint): Stroops {
  if (n < 0n) throw new RangeError('stroops cannot be negative');
  return n as Stroops;
}

/** Parse a decimal string ("100.5") to stroops. Rejects >7dp, negatives, junk. NO float. */
export function parseUnits(decimal: string): Stroops {
  if (!/^\d+(\.\d{1,7})?$/.test(decimal)) throw new RangeError(`invalid amount: ${decimal}`);
  const parts = decimal.split('.');
  const whole = parts[0] ?? '0';
  const frac = parts[1] ?? '';
  const fracPadded = (frac + '0000000').slice(0, 7);
  return stroops(BigInt(whole) * STROOPS_PER_UNIT + BigInt(fracPadded));
}

export function formatUnits(s: Stroops): string {
  const whole = s / STROOPS_PER_UNIT;
  const frac = (s % STROOPS_PER_UNIT).toString().padStart(7, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export const add = (a: Stroops, b: Stroops): Stroops => stroops(a + b);
export const sub = (a: Stroops, b: Stroops): Stroops => {
  if (b > a) throw new RangeError('insufficient: sub would go negative');
  return stroops(a - b);
};

/** amount * numerator / denominator, round DOWN. Remainder returned, NEVER lost. */
export function mulDivRoundDown(amount: bigint, numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) throw new RangeError('denominator must be > 0');
  const num = amount * numerator;
  const result = num / denominator;
  return { result, remainder: num - result * denominator };
}

/** Position value at a NAV (scaled 1e7). Remainder posts to ROUNDING account. */
export function valueAtNav(shares: Stroops, navScaled: bigint) {
  const { result, remainder } = mulDivRoundDown(shares, navScaled, STROOPS_PER_UNIT);
  return { value: stroops(result), remainder };
}
