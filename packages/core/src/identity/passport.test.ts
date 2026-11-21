import { describe, expect, it } from 'vitest';

import { AppError } from '../shared/errors';
import type { Result } from '../shared/result';
import { createInvestor, type Investor } from './investor';
import type { KycVerification } from './kyc.port';
import { issuePassport } from './passport';

function unwrap<T>(result: Result<T, AppError>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

function investor(overrides: Partial<Investor> = {}): Investor {
  return {
    id: 'inv-001',
    walletAddress: 'GDUMMYWALLETADDRESS0000000000000000000000000000000000000000',
    jurisdiction: 'NG',
    ...overrides,
  };
}

function approved(overrides: Partial<KycVerification> = {}): KycVerification {
  return {
    investorId: 'inv-001',
    status: 'approved',
    provider: 'mock-kyc',
    reference: 'mock-inv-001',
    verifiedAt: '2026-11-21T10:00:00.000Z',
    ...overrides,
  };
}

describe('createInvestor', () => {
  it('normalizes and validates investor identity', () => {
    const created = unwrap(
      createInvestor({
        id: '  inv-001  ',
        walletAddress: '  GDUMMY  ',
        jurisdiction: ' ng ',
      }),
    );

    expect(created).toEqual({
      id: 'inv-001',
      walletAddress: 'GDUMMY',
      jurisdiction: 'NG',
    });
    expect(Object.isFrozen(created)).toBe(true);
  });

  it('rejects blank ids, blank wallets, and malformed jurisdictions', () => {
    const blankId = createInvestor({
      id: ' ',
      walletAddress: 'GDUMMY',
      jurisdiction: 'NG',
    });
    const blankWallet = createInvestor({
      id: 'inv-001',
      walletAddress: '',
      jurisdiction: 'NG',
    });
    const badCountry = createInvestor({
      id: 'inv-001',
      walletAddress: 'GDUMMY',
      jurisdiction: 'NGA',
    });

    for (const result of [blankId, blankWallet, badCountry]) {
      if (result.ok) throw new Error('expected investor validation to fail');
      expect(result.error.code).toBe('VALIDATION');
    }
  });
});

describe('issuePassport', () => {
  it('grants an eligibility passport for an approved NG investor', () => {
    const passport = unwrap(
      issuePassport(investor(), approved(), '2026-11-21T10:05:00.000Z'),
    );

    expect(passport).toEqual({
      investorId: 'inv-001',
      walletAddress: investor().walletAddress,
      jurisdiction: 'NG',
      tier: 'retail',
      eligibleAt: '2026-11-21T10:05:00.000Z',
    });
    expect(Object.isFrozen(passport)).toBe(true);
  });

  it('grants eligibility for an approved GH investor', () => {
    const passport = unwrap(
      issuePassport(
        investor({ jurisdiction: 'GH' }),
        approved(),
        '2026-11-21T10:05:00.000Z',
      ),
    );

    expect(passport.jurisdiction).toBe('GH');
  });

  it('rejects a KYC verification that was rejected, preserving the reason', () => {
    const result = issuePassport(
      investor(),
      approved({ status: 'rejected', reason: 'Sanctions match' }),
      '2026-11-21T10:05:00.000Z',
    );

    if (result.ok) throw new Error('expected passport rejection');
    expect(result.error.code).toBe('KYC_REJECTED');
    expect(result.error.message).toBe('Sanctions match');
  });

  it('rejects pending KYC and verifications for another investor', () => {
    const pending = issuePassport(
      investor(),
      approved({ status: 'pending' }),
      '2026-11-21T10:05:00.000Z',
    );
    const mismatched = issuePassport(
      investor(),
      approved({ investorId: 'inv-999' }),
      '2026-11-21T10:05:00.000Z',
    );

    if (pending.ok) throw new Error('expected pending KYC to fail');
    expect(pending.error.code).toBe('KYC_REJECTED');

    if (mismatched.ok) throw new Error('expected mismatched KYC to fail');
    expect(mismatched.error.code).toBe('VALIDATION');
  });

  it('rejects an unsupported jurisdiction', () => {
    const result = issuePassport(
      investor({ jurisdiction: 'US' }),
      approved(),
      '2026-11-21T10:05:00.000Z',
    );

    if (result.ok) throw new Error('expected unsupported jurisdiction to fail');
    expect(result.error.code).toBe('KYC_REJECTED');
  });

  it('requires an eligibility timestamp', () => {
    const result = issuePassport(investor(), approved(), '  ');

    if (result.ok) throw new Error('expected missing timestamp to fail');
    expect(result.error.code).toBe('VALIDATION');
  });
});
