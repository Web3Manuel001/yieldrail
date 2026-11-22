import { afterEach, describe, expect, it } from 'vitest';

import {
  NOW,
  createHarness,
  keypair,
  postOnboard,
  type Harness,
  type OnboardBody,
  type OnboardResponse,
} from './harness';

describe('investor onboarding API', () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness === undefined) return;
    await harness.app.close();
    harness.container.close();
    harness = undefined;
  });

  it('onboards, authorizes the trustline, persists, and emits the event', async () => {
    harness = createHarness();
    const wallet = keypair().publicKey;
    const body: OnboardBody = {
      investorId: 'inv-001',
      wallet,
      jurisdiction: 'NG',
      productId: 'USTBL',
    };

    const response = await postOnboard(harness, body);
    expect(response.statusCode).toBe(200);

    const payload = response.json() as OnboardResponse;
    expect(payload.eligibility).toEqual({
      investorId: 'inv-001',
      productId: 'USTBL',
      walletAddress: wallet,
      jurisdiction: 'NG',
      tier: 'retail',
      eligibleAt: NOW.toISOString(),
    });
    expect(payload.authorizationTxHash).toBe('tx-1');

    expect(harness.submitted).toHaveLength(1);
    const operation = harness.submitted[0]?.operations[0] as
      | { type: string; trustor: string; assetCode: string; authorize: number }
      | undefined;
    expect(operation).toMatchObject({
      type: 'allowTrust',
      trustor: wallet,
      assetCode: 'USTBL',
      authorize: 1,
    });

    expect(harness.eventBus.events).toHaveLength(1);
    expect(harness.eventBus.events[0]).toMatchObject({
      type: 'investor.kyc.approved',
      payload: {
        investorId: 'inv-001',
        productId: 'USTBL',
        walletAddress: wallet,
        authorizationTxHash: 'tx-1',
      },
    });
  });

  it('rejects KYC without authorizing or persisting eligibility', async () => {
    harness = createHarness();
    const response = await postOnboard(harness, {
      investorId: 'inv-reject-001',
      wallet: keypair().publicKey,
      jurisdiction: 'NG',
      productId: 'USTBL',
    });

    expect(response.statusCode).toBe(403);
    expect(harness.submitted).toHaveLength(0);
    expect(harness.eventBus.events).toHaveLength(0);

    const eligibility = await harness.app.inject({
      method: 'GET',
      url: '/v1/investors/inv-reject-001/eligibility?productId=USTBL',
    });
    expect(eligibility.statusCode).toBe(404);
  });

  it('replays idempotently without repeating chain or event work', async () => {
    harness = createHarness();
    const body: OnboardBody = {
      investorId: 'inv-001',
      wallet: keypair().publicKey,
      jurisdiction: 'NG',
      productId: 'USTBL',
    };

    const first = await postOnboard(harness, body);
    const second = await postOnboard(harness, body);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(harness.submitted).toHaveLength(1);
    expect(harness.eventBus.events).toHaveLength(1);
  });

  it('rejects malformed onboarding bodies before the use-case runs', async () => {
    harness = createHarness();
    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/investors',
      payload: {
        investorId: '',
        wallet: 'GDUMMY',
        jurisdiction: 'NGA',
        productId: 'USTBL',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(harness.submitted).toHaveLength(0);
  });
});
