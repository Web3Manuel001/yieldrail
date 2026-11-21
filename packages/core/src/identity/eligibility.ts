import { AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';

/** Jurisdictions the buildathon demo can onboard. */
export const SUPPORTED_JURISDICTIONS = ['NG', 'GH'] as const;
export type Jurisdiction = (typeof SUPPORTED_JURISDICTIONS)[number];

export type EligibilityTier = 'retail';

/**
 * Compliance passport value object. It binds a KYC-approved investor to one
 * wallet and jurisdiction, and only exists for supported jurisdictions.
 */
export interface Eligibility {
  readonly investorId: string;
  readonly walletAddress: string;
  readonly jurisdiction: Jurisdiction;
  readonly tier: EligibilityTier;
  readonly eligibleAt: string;
}

export interface CreateEligibilityInput {
  investorId: string;
  walletAddress: string;
  jurisdiction: string;
  eligibleAt: string;
}

export function isSupportedJurisdiction(
  value: string,
): value is Jurisdiction {
  return (SUPPORTED_JURISDICTIONS as readonly string[]).includes(value);
}

/** Validate and freeze an eligibility passport. Pure: no I/O. */
export function createEligibility(
  input: CreateEligibilityInput,
): Result<Eligibility, AppError> {
  const investorId = input.investorId.trim();
  if (investorId === '') {
    return err(new AppError('VALIDATION', 'Investor id is required'));
  }

  const walletAddress = input.walletAddress.trim();
  if (walletAddress === '') {
    return err(new AppError('VALIDATION', 'Investor wallet address is required'));
  }

  const jurisdiction = input.jurisdiction.trim().toUpperCase();
  if (!isSupportedJurisdiction(jurisdiction)) {
    return err(
      new AppError(
        'KYC_REJECTED',
        'Investor jurisdiction is not supported for this product',
      ),
    );
  }

  const eligibleAt = input.eligibleAt.trim();
  if (eligibleAt === '') {
    return err(new AppError('VALIDATION', 'Eligibility timestamp is required'));
  }

  return ok(
    Object.freeze({
      investorId,
      walletAddress,
      jurisdiction,
      tier: 'retail',
      eligibleAt,
    }),
  );
}
