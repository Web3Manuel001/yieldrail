import type { Tier } from './eligibility';

/** Product-level eligibility rules. One policy per product. */
export interface EligibilityPolicy {
  readonly productId: string;
  readonly allowedJurisdictions: readonly string[];
  readonly minTier?: Tier;
}

/** Case-insensitive allowlist check; the domain stores jurisdictions uppercase. */
export function isJurisdictionAllowed(
  policy: EligibilityPolicy,
  jurisdiction: string,
): boolean {
  const normalized = jurisdiction.trim().toUpperCase();
  return policy.allowedJurisdictions.some(
    (allowed) => allowed.trim().toUpperCase() === normalized,
  );
}
