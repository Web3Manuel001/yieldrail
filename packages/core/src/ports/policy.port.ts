import type { EligibilityPolicy } from '../identity/policy';
import type { AppError } from '../shared/errors';
import type { Result } from '../shared/result';

/** Product policy lookup. Implemented by fixture or remote policy adapters. */
export interface PolicyPort {
  getPolicy(productId: string): Result<EligibilityPolicy, AppError>;
}
