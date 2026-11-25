import type { Investor } from '../identity/investor';
import type { AppError } from '../shared/errors';
import type { Result } from '../shared/result';

/** Read-only investor lookup used by money-moving use-cases. */
export interface InvestorLookupPort {
  /** Load an onboarded investor by id, or null when they do not exist. */
  findById(investorId: string): Result<Investor | null, AppError>;
}
