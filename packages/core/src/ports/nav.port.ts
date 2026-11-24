import type { AppError } from '../shared/errors';
import type { Result } from '../shared/result';

/** NAV price for a product, scaled by STROOPS_PER_UNIT (1e7). */
export interface NavPort {
  getNav(productId: string): Result<bigint, AppError>;
}
