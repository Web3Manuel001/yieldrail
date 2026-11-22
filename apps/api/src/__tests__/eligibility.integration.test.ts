import { afterEach, describe, expect, it } from 'vitest';

import { createFixturePolicyPort } from '../fixture-policy.adapter';
import {
  createHarness,
  keypair,
  postOnboard,
  type Harness,
  type OnboardResponse,
} from './harness';

describe('product eligibility policy', () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness === undefined) return;
    await harness.app.close();
    harness.container.close();
    harness = undefined;
  });

  it('keeps eligibility separate per product', async () => {
    const policyPort = createFixturePolicyPort([
      { productId: 'USTBL', allowedJurisdictions: ['GH'], minTier: 'retail' },
      {
        productId: 'USTBL-GH',
        allowedJurisdictions: ['GH'],
        minTier: 'retail',
      },
    ]);
    harness = createHarness({ policyPort });
    const investorId = 'inv-001';
    const wallet = keypair().publicKey;

    for (const productId of ['USTBL', 'USTBL-GH']) {
      const response = await postOnboard(harness, {
        investorId,
        wallet,
        jurisdiction: 'GH',
        productId,
      });
      expect(response.statusCode).toBe(200);
      expect((response.json() as OnboardResponse).eligibility.productId).toBe(
        productId,
      );
    }

    expect(harness.submitted).toHaveLength(2);
    expect(harness.eventBus.events).toHaveLength(2);

    const eligibility = await harness.app.inject({
      method: 'GET',
      url: `/v1/investors/${investorId}/eligibility?productId=USTBL-GH`,
    });
    expect(eligibility.statusCode).toBe(200);
    expect((eligibility.json() as OnboardResponse).eligibility.productId).toBe(
      'USTBL-GH',
    );
  });

  it('enforces the policy minimum tier', async () => {
    const policyPort = createFixturePolicyPort([
      {
        productId: 'USTBL',
        allowedJurisdictions: ['NG'],
        minTier: 'accredited',
      },
    ]);
    harness = createHarness({ policyPort });
    const wallet = keypair().publicKey;

    const retail = await postOnboard(harness, {
      investorId: 'inv-retail-001',
      wallet,
      jurisdiction: 'NG',
      productId: 'USTBL',
    });
    expect(retail.statusCode).toBe(403);
    expect(harness.submitted).toHaveLength(0);
    expect(harness.eventBus.events).toHaveLength(0);

    const accredited = await postOnboard(harness, {
      investorId: 'inv-accredited-001',
      wallet,
      jurisdiction: 'NG',
      productId: 'USTBL',
    });
    expect(accredited.statusCode).toBe(200);
    expect((accredited.json() as OnboardResponse).eligibility.tier).toBe(
      'accredited',
    );
    expect(harness.submitted).toHaveLength(1);
  });
});
