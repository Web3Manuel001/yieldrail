/** Injectable time source; keeps the domain independent of `Date.now()`. */
export interface ClockPort {
  now(): Date;
}
