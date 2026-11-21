import { Asset, Keypair, Operation, type Transaction } from '@stellar/stellar-sdk';
import { AppError, type Result } from '@yieldrail/core';
import { describe, expect, it } from 'vitest';

import { TESTNET_NETWORK_PASSPHRASE } from '../client';
import type { HorizonGateway } from '../gateway';
import { changeTrust } from './change-trust';

interface MockGateway {
  gateway: HorizonGateway;
  submitted: Transaction[];
}

function createGateway(): MockGateway {
  const submitted: Transaction[] = [];
  return {
    submitted,
    gateway: {
      loadAccount: async () => ({ sequenceNumber: () => '987654321' }),
      submitTransaction: async (transaction) => {
        submitted.push(transaction);
        return { hash: 'cafebabe' };
      },
    },
  };
}

function expectError(result: Result<unknown, AppError>, code: string): void {
  if (result.ok) throw new Error('expected operation to fail');
  expect(result.error.code).toBe(code);
}

describe('changeTrust', () => {
  it('submits a signed trustline for the investor', async () => {
    const investor = Keypair.random();
    const issuer = Keypair.random();
    const mock = createGateway();

    const result = await changeTrust(
      mock.gateway,
      TESTNET_NETWORK_PASSPHRASE,
      {
        holder: investor.publicKey(),
        signer: investor,
        assetCode: 'USTBL',
        issuer: issuer.publicKey(),
      },
    );

    if (!result.ok) throw result.error;
    expect(result.value).toEqual({
      hash: 'cafebabe',
      assetCode: 'USTBL',
      issuer: issuer.publicKey(),
    });

    const transaction = mock.submitted[0];
    if (transaction === undefined) throw new Error('no transaction submitted');
    expect(transaction.source).toBe(investor.publicKey());
    expect(transaction.networkPassphrase).toBe(TESTNET_NETWORK_PASSPHRASE);
    expect(transaction.signatures).toHaveLength(1);

    const operation = transaction.operations[0] as Operation.ChangeTrust;
    expect(operation.type).toBe('changeTrust');
    if (!(operation.line instanceof Asset)) {
      throw new Error('expected a classic asset trustline');
    }
    expect(operation.line.getCode()).toBe('USTBL');
    expect(operation.line.getIssuer()).toBe(issuer.publicKey());
  });

  it('rejects a signer that is not the holder', async () => {
    const investor = Keypair.random();
    const issuer = Keypair.random();
    const mock = createGateway();

    const result = await changeTrust(
      mock.gateway,
      TESTNET_NETWORK_PASSPHRASE,
      {
        holder: investor.publicKey(),
        signer: Keypair.random(),
        assetCode: 'USTBL',
        issuer: issuer.publicKey(),
      },
    );

    expectError(result, 'VALIDATION');
    expect(mock.submitted).toHaveLength(0);
  });

  it('rejects an invalid asset issuer before touching Horizon', async () => {
    const investor = Keypair.random();
    const mock = createGateway();

    const result = await changeTrust(
      mock.gateway,
      TESTNET_NETWORK_PASSPHRASE,
      {
        holder: investor.publicKey(),
        signer: investor,
        assetCode: 'USTBL',
        issuer: 'GNOTAVALIDISSUER',
      },
    );

    expectError(result, 'VALIDATION');
    expect(mock.submitted).toHaveLength(0);
  });

  it('converts a submission failure into a CHAIN error', async () => {
    const investor = Keypair.random();
    const issuer = Keypair.random();
    const result = await changeTrust(
      {
        loadAccount: async () => ({ sequenceNumber: () => '1' }),
        submitTransaction: async () => {
          throw new Error('horizon down');
        },
      },
      TESTNET_NETWORK_PASSPHRASE,
      {
        holder: investor.publicKey(),
        signer: investor,
        assetCode: 'USTBL',
        issuer: issuer.publicKey(),
      },
    );

    expectError(result, 'CHAIN');
  });
});
