import type { Eligibility } from '../identity/eligibility';
import type { Investor } from '../identity/investor';
import type { AppError } from '../shared/errors';
import type { Result } from '../shared/result';

export interface StoredEligibility {
  readonly eligibility: Eligibility;
  readonly authorizationTxHash: string;
}

/** Persistence boundary for onboarding; one record per investor + product. */
export interface InvestorRepositoryPort {
  findEligibility(
    investorId: string,
    productId: string,
  ): Result<StoredEligibility | null, AppError>;

  /** Persist the investor and eligibility atomically after chain authorization. */
  saveOnboarded(
    investor: Investor,
    eligibility: Eligibility,
    authorizationTxHash: string,
  ): Result<void, AppError>;
}
