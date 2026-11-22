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

const TIER_RANK: Record<Tier, number> = { retail: 0, accredited: 1 };

/** Whether a verified tier satisfies the product's optional minimum tier. */
export function meetsMinimumTier(tier: Tier, minTier?: Tier): boolean {
  if (minTier === undefined) return true;
  return TIER_RANK[tier] >= TIER_RANK[minTier];
}
