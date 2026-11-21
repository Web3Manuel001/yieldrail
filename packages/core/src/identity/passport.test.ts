import { describe, expect, it } from 'vitest';

import { AppError } from '../shared/errors';
import type { Result } from '../shared/result';
import { createInvestor, type Investor } from './investor';
import type { KycVerification } from './kyc.port';
import { issuePassport } from './passport';
import { DEMO_ELIGIBILITY_POLICY } from './policy.fixture';
import type { EligibilityPolicy } from './policy';

const NOW = new Date('2026-11-21T10:05:00.000Z');
const NOW_ISO = '2026-11-21T10:05:00.000Z';

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

function policy(overrides: Partial<EligibilityPolicy> = {}): EligibilityPolicy {
  return { ...DEMO_ELIGIBILITY_POLICY, ...overrides };
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
  it('grants a product-scoped passport for a jurisdiction inside the policy', () => {
    const passport = unwrap(
      issuePassport(investor(), approved(), DEMO_ELIGIBILITY_POLICY, NOW),
    );

    expect(passport).toEqual({
      investorId: 'inv-001',
      productId: 'USTBL',
      walletAddress: investor().walletAddress,
      jurisdiction: 'NG',
      tier: 'retail',
      eligibleAt: NOW_ISO,
    });
    expect(Object.isFrozen(passport)).toBe(true);
  });

  it('grants eligibility inside a policy that allows GH', () => {
    const passport = unwrap(
      issuePassport(
        investor({ jurisdiction: 'GH' }),
        approved(),
        DEMO_ELIGIBILITY_POLICY,
        NOW,
      ),
    );

    expect(passport.jurisdiction).toBe('GH');
    expect(passport.productId).toBe('USTBL');
  });

  it('rejects a jurisdiction outside the policy', () => {
    const outsideDemo = issuePassport(
      investor({ jurisdiction: 'US' }),
      approved(),
      DEMO_ELIGIBILITY_POLICY,
      NOW,
    );
    const outsideNarrowPolicy = issuePassport(
      investor({ jurisdiction: 'NG' }),
      approved(),
      policy({ allowedJurisdictions: ['GH'] }),
      NOW,
    );

    for (const result of [outsideDemo, outsideNarrowPolicy]) {
      if (result.ok) throw new Error('expected disallowed jurisdiction to fail');
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('scopes eligibility to the policy product', () => {
    const passport = unwrap(
      issuePassport(
        investor({ jurisdiction: 'GH' }),
        approved(),
        policy({ productId: 'USTBL-GH', allowedJurisdictions: ['GH'] }),
        NOW,
      ),
    );

    expect(passport.productId).toBe('USTBL-GH');
  });

  it('rejects a KYC verification that was rejected, preserving the reason', () => {
    const result = issuePassport(
      investor(),
      approved({ status: 'rejected', reason: 'Sanctions match' }),
      DEMO_ELIGIBILITY_POLICY,
      NOW,
    );

    if (result.ok) throw new Error('expected passport rejection');
    expect(result.error.code).toBe('KYC_REJECTED');
    expect(result.error.message).toBe('Sanctions match');
  });

  it('rejects pending KYC and verifications for another investor', () => {
    const pending = issuePassport(
      investor(),
      approved({ status: 'pending' }),
      DEMO_ELIGIBILITY_POLICY,
      NOW,
    );
    const mismatched = issuePassport(
      investor(),
      approved({ investorId: 'inv-999' }),
      DEMO_ELIGIBILITY_POLICY,
      NOW,
    );

    if (pending.ok) throw new Error('expected pending KYC to fail');
    expect(pending.error.code).toBe('KYC_REJECTED');

    if (mismatched.ok) throw new Error('expected mismatched KYC to fail');
    expect(mismatched.error.code).toBe('VALIDATION');
  });

  it('rejects an invalid decision date without throwing', () => {
    const result = issuePassport(
      investor(),
      approved(),
      DEMO_ELIGIBILITY_POLICY,
      new Date(Number.NaN),
    );

    if (result.ok) throw new Error('expected invalid date to fail');
    expect(result.error.code).toBe('VALIDATION');
  });
});
