import {
  AppError,
  err,
  ok,
  type KycPort,
  type KycRequest,
  type KycVerification,
  type Result,
  type Tier,
} from '@yieldrail/core';

export const MOCK_KYC_PROVIDER = 'mock-kyc';
/** Investor ids containing this marker are deterministically rejected. */
export const MOCK_KYC_REJECT_MARKER = 'reject';
/** Investor ids containing this marker verify at the accredited tier. */
export const MOCK_KYC_ACCREDITED_MARKER = 'accredited';

export interface MockKycOptions {
  /** Injectable clock so tests are deterministic. Defaults to real time. */
  readonly now?: () => string;
}

/**
 * Deterministic KYC adapter for the demo and tests. No network calls: an
 * investor id containing "reject" is rejected, everything else is approved.
 */
export function createMockKycAdapter(options: MockKycOptions = {}): KycPort {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async verify(
      request: KycRequest,
    ): Promise<Result<KycVerification, AppError>> {
      const investorId = request.investorId.trim();
      if (investorId === '') {
        return err(new AppError('VALIDATION', 'Investor id is required'));
      }

      const tier: Tier = investorId
        .toLowerCase()
        .includes(MOCK_KYC_ACCREDITED_MARKER)
        ? 'accredited'
        : 'retail';
      const base = {
        investorId,
        tier,
        provider: MOCK_KYC_PROVIDER,
        reference: `mock-${investorId}`,
        verifiedAt: now(),
      };

      if (investorId.toLowerCase().includes(MOCK_KYC_REJECT_MARKER)) {
        return ok({
          ...base,
          status: 'rejected',
          reason: 'Mock KYC rejection marker present in investor id',
        });
      }

      return ok({ ...base, status: 'approved' });
    },
  };
}
