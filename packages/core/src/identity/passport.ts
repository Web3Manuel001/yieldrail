import { AppError } from '../shared/errors';
import { err, type Result } from '../shared/result';
import { createEligibility, type Eligibility } from './eligibility';
import type { Investor } from './investor';
import type { KycVerification } from './kyc.port';

/**
 * Pure compliance policy: an investor gets an eligibility passport only when
 * the KYC result belongs to that investor, is approved, and the jurisdiction
 * is supported. No I/O, no clock: callers pass the eligibility timestamp.
 */
export function issuePassport(
  investor: Investor,
  verification: KycVerification,
  eligibleAt: string,
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

  return createEligibility({
    investorId: investor.id,
    walletAddress: investor.walletAddress,
    jurisdiction: investor.jurisdiction,
    eligibleAt,
  });
}
