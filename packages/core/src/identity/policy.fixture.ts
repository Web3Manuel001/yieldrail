import type { EligibilityPolicy } from './policy';

/** Demo product policy: USTBL is available to KYC-approved NG/GH investors. */
export const DEMO_ELIGIBILITY_POLICY: EligibilityPolicy = Object.freeze({
  productId: 'USTBL',
  allowedJurisdictions: Object.freeze(['NG', 'GH']),
  minTier: 'retail',
});
