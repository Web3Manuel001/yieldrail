import { describe, expect, it } from 'vitest';

import {
  MOCK_KYC_PROVIDER,
  createMockKycAdapter,
} from './mock-kyc.adapter';

const now = () => '2026-11-21T10:00:00.000Z';

describe('mock KYC adapter', () => {
  it('approves deterministically and stamps the injected clock', async () => {
    const adapter = createMockKycAdapter({ now });

    const first = await adapter.verify({
      investorId: 'inv-001',
      jurisdiction: 'NG',
    });
    const second = await adapter.verify({
      investorId: 'inv-001',
      jurisdiction: 'NG',
    });

    if (!first.ok) throw first.error;
    if (!second.ok) throw second.error;
    expect(first.value).toEqual({
      investorId: 'inv-001',
      status: 'approved',
      provider: MOCK_KYC_PROVIDER,
      reference: 'mock-inv-001',
      verifiedAt: now(),
    });
    expect(second.value).toEqual(first.value);
  });

  it('rejects investor ids containing the reject marker', async () => {
    const adapter = createMockKycAdapter({ now });

    const result = await adapter.verify({
      investorId: 'inv-reject-002',
      jurisdiction: 'GH',
    });

    if (!result.ok) throw result.error;
    expect(result.value.status).toBe('rejected');
    expect(result.value.reason).toContain('rejection marker');
  });

  it('returns a Result error for a blank investor id', async () => {
    const adapter = createMockKycAdapter({ now });

    const result = await adapter.verify({
      investorId: '   ',
      jurisdiction: 'NG',
    });

    if (result.ok) throw new Error('expected blank id to fail');
    expect(result.error.code).toBe('VALIDATION');
  });
});
