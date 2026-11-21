import { Keypair, Operation, type Transaction } from '@stellar/stellar-sdk';
import { AppError, type Result } from '@yieldrail/core';
import { describe, expect, it } from 'vitest';

import { TESTNET_NETWORK_PASSPHRASE } from '../client';
import type { HorizonGateway } from '../gateway';
import { authorizeTrustline } from './authorize-trustline';

interface MockGateway {
  gateway: HorizonGateway;
  submitted: Transaction[];
}

function createGateway(): MockGateway {
  const submitted: Transaction[] = [];
  return {
    submitted,
    gateway: {
      loadAccount: async () => ({ sequenceNumber: () => '456789012' }),
      submitTransaction: async (transaction) => {
        submitted.push(transaction);
        return { hash: 'allowtrusthash' };
      },
    },
  };
}

function expectError(result: Result<unknown, AppError>, code: string): void {
  if (result.ok) throw new Error('expected operation to fail');
  expect(result.error.code).toBe(code);
}

describe('authorizeTrustline', () => {
  it('submits allowTrust signed by the issuer, not the investor', async () => {
    const issuer = Keypair.random();
    const investor = Keypair.random();
    const mock = createGateway();

    const result = await authorizeTrustline(
      mock.gateway,
      TESTNET_NETWORK_PASSPHRASE,
      {
        issuer: issuer.publicKey(),
        signer: issuer,
        investor: investor.publicKey(),
        assetCode: 'USTBL',
      },
    );

    if (!result.ok) throw result.error;
    expect(result.value).toEqual({
      hash: 'allowtrusthash',
      investor: investor.publicKey(),
      assetCode: 'USTBL',
      issuer: issuer.publicKey(),
      authorized: true,
    });

    const transaction = mock.submitted[0];
    if (transaction === undefined) throw new Error('no transaction submitted');
    expect(transaction.source).toBe(issuer.publicKey());
    expect(transaction.networkPassphrase).toBe(TESTNET_NETWORK_PASSPHRASE);
    expect(transaction.signatures).toHaveLength(1);

    const signature = transaction.signatures[0];
    if (signature === undefined) throw new Error('missing signature');
    const signatureBytes = signature.signature();
    expect(issuer.verify(transaction.hash(), signatureBytes)).toBe(true);
    expect(investor.verify(transaction.hash(), signatureBytes)).toBe(false);

    const operation = transaction.operations[0] as Operation.AllowTrust;
    expect(operation.type).toBe('allowTrust');
    expect(operation.trustor).toBe(investor.publicKey());
    expect(operation.assetCode).toBe('USTBL');
    // `true` encodes on the wire as TrustLineFlag.authorize (1).
    expect(operation.authorize).toBe(1);
  });

  it('rejects a signer that is not the issuer', async () => {
    const issuer = Keypair.random();
    const investor = Keypair.random();
    const mock = createGateway();

    const result = await authorizeTrustline(
      mock.gateway,
      TESTNET_NETWORK_PASSPHRASE,
      {
        issuer: issuer.publicKey(),
        signer: investor,
        investor: investor.publicKey(),
        assetCode: 'USTBL',
      },
    );

    expectError(result, 'VALIDATION');
    expect(mock.submitted).toHaveLength(0);
  });

  it('rejects an invalid investor address before touching Horizon', async () => {
    const issuer = Keypair.random();
    const mock = createGateway();

    const result = await authorizeTrustline(
      mock.gateway,
      TESTNET_NETWORK_PASSPHRASE,
      {
        issuer: issuer.publicKey(),
        signer: issuer,
        investor: 'GNOTAVALIDINVESTOR',
        assetCode: 'USTBL',
      },
    );

    expectError(result, 'VALIDATION');
    expect(mock.submitted).toHaveLength(0);
  });

  it('converts a Horizon failure into a Result error', async () => {
    const issuer = Keypair.random();
    const investor = Keypair.random();

    const result = await authorizeTrustline(
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
        investor: investor.publicKey(),
        assetCode: 'USTBL',
      },
    );

    expectError(result, 'CHAIN');
  });

  it('converts an account load failure into a Result error', async () => {
    const issuer = Keypair.random();
    const investor = Keypair.random();

    const result = await authorizeTrustline(
      {
        loadAccount: async () => {
          throw new Error('account not found');
        },
        submitTransaction: async () => ({ hash: 'unused' }),
      },
      TESTNET_NETWORK_PASSPHRASE,
      {
        issuer: issuer.publicKey(),
        signer: issuer,
        investor: investor.publicKey(),
        assetCode: 'USTBL',
      },
    );

    expectError(result, 'CHAIN');
  });
});
