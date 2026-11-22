import { Keypair } from '@stellar/stellar-sdk';
import { AppError, type Result } from '@yieldrail/core';
import { describe, expect, it } from 'vitest';

import type { AccountBalance, HorizonGateway } from '../gateway';
import { getBalance } from './get-balance';

const ACCOUNT = Keypair.random().publicKey();
const ISSUER = Keypair.random().publicKey();

function gateway(balances: readonly AccountBalance[]): HorizonGateway {
  return {
    loadAccount: async () => ({
      sequenceNumber: () => '1',
      balances,
    }),
    submitTransaction: async () => ({ hash: 'unused' }),
  };
}

function expectError(result: Result<unknown, AppError>, code: string): void {
  if (result.ok) throw new Error('expected operation to fail');
  expect(result.error.code).toBe(code);
}

describe('getBalance', () => {
  it('returns the matching asset balance as bigint Stroops', async () => {
    const result = await getBalance(
      gateway([
        { asset_type: 'native', balance: '100.0000000' },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: ISSUER,
          balance: '0.2500000',
          is_authorized: true,
        },
      ]),
      { account: ACCOUNT, assetCode: 'USDC', assetIssuer: ISSUER },
    );

    if (!result.ok) throw result.error;
    expect(result.value).toBe(2_500_000n);
    expect(typeof result.value).toBe('bigint');
  });

  it('returns zero when the account has no trustline for the asset', async () => {
    const result = await getBalance(
      gateway([{ asset_type: 'native', balance: '100.0000000' }]),
      { account: ACCOUNT, assetCode: 'USDC', assetIssuer: ISSUER },
    );

    if (!result.ok) throw result.error;
    expect(result.value).toBe(0n);
    expect(typeof result.value).toBe('bigint');
  });

  it('does not confuse assets that share a code but not an issuer', async () => {
    const otherIssuer = Keypair.random().publicKey();
    const result = await getBalance(
      gateway([
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: otherIssuer,
          balance: '5.0000000',
        },
      ]),
      { account: ACCOUNT, assetCode: 'USDC', assetIssuer: ISSUER },
    );

    if (!result.ok) throw result.error;
    expect(result.value).toBe(0n);
  });

  it('rejects invalid account, issuer, and asset inputs before Horizon', async () => {
    const common = { account: ACCOUNT, assetCode: 'USDC', assetIssuer: ISSUER };

    const badAccount = await getBalance(gateway([]), {
      ...common,
      account: 'GNOTAVALIDACCOUNT',
    });
    const badIssuer = await getBalance(gateway([]), {
      ...common,
      assetIssuer: 'GNOTAVALIDISSUER',
    });
    const badCode = await getBalance(gateway([]), { ...common, assetCode: ' ' });

    for (const result of [badAccount, badIssuer, badCode]) {
      expectError(result, 'VALIDATION');
    }
  });

  it('converts Horizon failures into a CHAIN error', async () => {
    const result = await getBalance(
      {
        loadAccount: async () => {
          throw new Error('horizon down');
        },
        submitTransaction: async () => ({ hash: 'unused' }),
      },
      { account: ACCOUNT, assetCode: 'USDC', assetIssuer: ISSUER },
    );

    expectError(result, 'CHAIN');
  });

  it('converts a malformed Horizon balance into a CHAIN error', async () => {
    const result = await getBalance(
      gateway([
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: ISSUER,
          balance: 'not-a-number',
        },
      ]),
      { account: ACCOUNT, assetCode: 'USDC', assetIssuer: ISSUER },
    );

    expectError(result, 'CHAIN');
  });
});
