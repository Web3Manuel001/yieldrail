import { AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';

/**
 * Product access tier. Retail is the default; accredited is a higher KYC
 * tier. Product policies declare a minimum tier when one is required.
 */
export const TIERS = ['retail', 'accredited'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Compliance passport value object. It binds a KYC-approved investor to one
 * wallet, jurisdiction, and product. Eligibility is per investor + product,
 * never global.
 */
export interface Eligibility {
  readonly investorId: string;
  readonly productId: string;
  readonly walletAddress: string;
  readonly jurisdiction: string;
  readonly tier: Tier;
  readonly eligibleAt: string;
}

export interface MakeEligibilityInput {
  investorId: string;
  productId: string;
  walletAddress: string;
  jurisdiction: string;
  tier: Tier;
  eligibleAt: string;
}

/** Validate and freeze an eligibility passport. Pure: no I/O, no clock. */
export function makeEligibility(
  input: MakeEligibilityInput,
): Result<Eligibility, AppError> {
  const investorId = input.investorId.trim();
  if (investorId === '') {
    return err(new AppError('VALIDATION', 'Investor id is required'));
  }

  const productId = input.productId.trim();
  if (productId === '') {
    return err(new AppError('VALIDATION', 'Product id is required'));
  }

  const walletAddress = input.walletAddress.trim();
  if (walletAddress === '') {
    return err(new AppError('VALIDATION', 'Investor wallet address is required'));
  }

  const jurisdiction = input.jurisdiction.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(jurisdiction)) {
    return err(
      new AppError('VALIDATION', 'Investor jurisdiction must be a 2-letter country code'),
    );
  }

  const eligibleAt = input.eligibleAt.trim();
  if (eligibleAt === '') {
    return err(new AppError('VALIDATION', 'Eligibility timestamp is required'));
  }

  return ok(
    Object.freeze({
      investorId,
      productId,
      walletAddress,
      jurisdiction,
      tier: input.tier,
      eligibleAt,
    }),
  );
}
