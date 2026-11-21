import { AppError } from '../shared/errors';
import type { Result } from '../shared/result';

export type KycStatus = 'approved' | 'rejected' | 'pending';

/** Minimal KYC request. Adapters may collect more data out of band. */
export interface KycRequest {
  readonly investorId: string;
  readonly jurisdiction: string;
}

export interface KycVerification {
  readonly investorId: string;
  readonly status: KycStatus;
  readonly provider: string;
  readonly reference: string;
  readonly verifiedAt: string;
  /** Present only when status is `rejected`. */
  readonly reason?: string;
}

/** Port implemented by KYC adapters (mock now, real provider later). */
export interface KycPort {
  verify(request: KycRequest): Promise<Result<KycVerification, AppError>>;
}
