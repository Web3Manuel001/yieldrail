import { AppError } from '../shared/errors';
import { err, type Result } from '../shared/result';
import { makeEligibility, type Eligibility } from './eligibility';
import type { Investor } from './investor';
import type { KycVerification } from './kyc.port';
import { isJurisdictionAllowed, type EligibilityPolicy } from './policy';

/**
 * Pure compliance policy: an investor gets an eligibility passport only when
 * the KYC result belongs to that investor, is approved, and the investor's
 * jurisdiction is allowed by the product policy. No I/O and no `Date.now()`;
 * callers inject the decision time.
 */
export function issuePassport(
  investor: Investor,
  verification: KycVerification,
  policy: EligibilityPolicy,
  now: Date,
): Result<Eligibility, AppError> {
  if (verification.investorId !== investor.id) {
    return err(
      new AppError(
        'VALIDATION',
        'KYC verification does not belong to this investor',
      ),
    );
  }

  if (verification.status === 'pending') {
    return err(new AppError('KYC_REJECTED', 'KYC verification is still pending'));
  }

  if (verification.status === 'rejected') {
    return err(
      new AppError(
        'KYC_REJECTED',
        verification.reason ?? 'KYC verification was rejected',
      ),
    );
  }

  if (!isJurisdictionAllowed(policy, investor.jurisdiction)) {
    return err(
      new AppError(
        'VALIDATION',
        'Investor jurisdiction is not allowed for this product',
      ),
    );
  }

  if (Number.isNaN(now.getTime())) {
    return err(new AppError('VALIDATION', 'Eligibility timestamp is invalid'));
  }

  return makeEligibility({
    investorId: investor.id,
    productId: policy.productId,
    walletAddress: investor.walletAddress,
    jurisdiction: investor.jurisdiction,
    tier: verification.tier,
    eligibleAt: now.toISOString(),
  });
}
