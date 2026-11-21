import {
  AuthClawbackEnabledFlag,
  AuthRequiredFlag,
  AuthRevocableFlag,
  Keypair,
  Operation,
  type Transaction,
} from '@stellar/stellar-sdk';
import { AppError, type Result } from '@yieldrail/core';
import { describe, expect, it } from 'vitest';

import { TESTNET_NETWORK_PASSPHRASE } from '../client';
import type { HorizonGateway } from '../gateway';
import {
  ASSET_AUTH_FLAGS,
  hasRequiredAuthFlags,
  issueAsset,
} from './issue-asset';

interface MockGateway {
  gateway: HorizonGateway;
  submitted: Transaction[];
}

function createGateway(): MockGateway {
  const submitted: Transaction[] = [];
  return {
    submitted,
    gateway: {
      loadAccount: async () => ({ sequenceNumber: () => '123456789' }),
      submitTransaction: async (transaction) => {
        submitted.push(transaction);
        return { hash: 'deadbeef' };
      },
    },
  };
}

function expectError(result: Result<unknown, AppError>, code: string): void {
  if (result.ok) throw new Error('expected operation to fail');
  expect(result.error.code).toBe(code);
}

describe('asset authorization flags', () => {
  it('encodes required + revocable + clawback enabled as bit flags', () => {
    expect(AuthRequiredFlag).toBe(1);
    expect(AuthRevocableFlag).toBe(2);
    expect(AuthClawbackEnabledFlag).toBe(8);
    expect(ASSET_AUTH_FLAGS).toBe(11);
  });

  it('requires all three USTBL issuer flags', () => {
    const complete = {
      auth_required: true,
      auth_revocable: true,
      auth_clawback_enabled: true,
    };
    expect(hasRequiredAuthFlags(complete)).toBe(true);
    expect(hasRequiredAuthFlags({ ...complete, auth_required: false })).toBe(false);
    expect(hasRequiredAuthFlags({ ...complete, auth_revocable: false })).toBe(false);
    expect(
      hasRequiredAuthFlags({ ...complete, auth_clawback_enabled: false }),
    ).toBe(false);
  });
});

describe('issueAsset', () => {
  it('submits a signed setOptions transaction with USTBL flags', async () => {
    const issuer = Keypair.random();
    const mock = createGateway();

    const result = await issueAsset(
      mock.gateway,
      TESTNET_NETWORK_PASSPHRASE,
      {
        issuer: issuer.publicKey(),
        signer: issuer,
        assetCode: 'USTBL',
      },
    );

    if (!result.ok) throw result.error;
    expect(result.value).toEqual({
      hash: 'deadbeef',
      assetCode: 'USTBL',
      issuer: issuer.publicKey(),
      flags: 11,
    });

    const transaction = mock.submitted[0];
    if (transaction === undefined) throw new Error('no transaction submitted');
    expect(transaction.source).toBe(issuer.publicKey());
    expect(transaction.networkPassphrase).toBe(TESTNET_NETWORK_PASSPHRASE);
    expect(transaction.signatures).toHaveLength(1);

    const operation = transaction.operations[0] as Operation.SetOptions;
    expect(operation.type).toBe('setOptions');
    expect(operation.setFlags).toBe(ASSET_AUTH_FLAGS);
  });

  it('rejects a signer that is not the issuer', async () => {
    const issuer = Keypair.random();
    const mock = createGateway();

    const result = await issueAsset(
      mock.gateway,
      TESTNET_NETWORK_PASSPHRASE,
      {
        issuer: issuer.publicKey(),
        signer: Keypair.random(),
        assetCode: 'USTBL',
      },
    );

    expectError(result, 'VALIDATION');
    expect(mock.submitted).toHaveLength(0);
  });

  it('rejects an invalid asset code before touching Horizon', async () => {
    const issuer = Keypair.random();
    const mock = createGateway();

    const result = await issueAsset(
      mock.gateway,
      TESTNET_NETWORK_PASSPHRASE,
      {
        issuer: issuer.publicKey(),
        signer: issuer,
        assetCode: 'THIS-CODE-IS-TOO-LONG',
      },
    );

    expectError(result, 'VALIDATION');
    expect(mock.submitted).toHaveLength(0);
  });

  it('converts a submission failure into a CHAIN error', async () => {
    const issuer = Keypair.random();
    const result = await issueAsset(
      {
        loadAccount: async () => ({ sequenceNumber: () => '1' }),
        submitTransaction: async () => {
          throw new Error('horizon down');
        },
      },
      TESTNET_NETWORK_PASSPHRASE,
      {
        issuer: issuer.publicKey(),
        signer: issuer,
        assetCode: 'USTBL',
      },
    );

    expectError(result, 'CHAIN');
  });
});
