import {
  AppError,
  err,
  ok,
  type EligibilityPolicy,
  type PolicyPort,
  type Result,
} from '@yieldrail/core';

/** Demo USTBL policy; production policies would come from config/storage. */
export const DEMO_USTBL_POLICY: EligibilityPolicy = Object.freeze({
  productId: 'USTBL',
  allowedJurisdictions: Object.freeze(['NG', 'GH']),
  minTier: 'retail',
});

export function createFixturePolicyPort(
  policies: readonly EligibilityPolicy[] = [DEMO_USTBL_POLICY],
): PolicyPort {
  const byProduct = new Map(
    policies.map((policy) => [policy.productId, policy] as const),
  );

  return {
    getPolicy(productId: string): Result<EligibilityPolicy, AppError> {
      const policy = byProduct.get(productId);
      if (policy === undefined) {
        return err(
          new AppError('NOT_FOUND', `No eligibility policy for ${productId}`),
        );
      }
      return ok(policy);
    },
  };
}
