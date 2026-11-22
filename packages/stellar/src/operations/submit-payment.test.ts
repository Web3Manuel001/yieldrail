import { Keypair, Operation, type Transaction } from '@stellar/stellar-sdk';
import { AppError, parseUnits, type Result } from '@yieldrail/core';
import { describe, expect, it } from 'vitest';

import { TESTNET_NETWORK_PASSPHRASE } from '../client';
import type { HorizonGateway } from '../gateway';
import { submitPayment } from './submit-payment';

interface MockGateway {
  gateway: HorizonGateway;
  submitted: Transaction[];
}

function createGateway(): MockGateway {
  const submitted: Transaction[] = [];
  return {
    submitted,
    gateway: {
      loadAccount: async () => ({ sequenceNumber: () => '246810121' }),
      submitTransaction: async (transaction) => {
        submitted.push(transaction);
        return { hash: 'paymenthash' };
      },
    },
  };
}

function expectError(result: Result<unknown, AppError>, code: string): void {
  if (result.ok) throw new Error('expected operation to fail');
  expect(result.error.code).toBe(code);
}

describe('submitPayment', () => {
  it('submits a payment signed by its source', async () => {
    const source = Keypair.random();
    const issuer = Keypair.random();
    const destination = Keypair.random();
    const mock = createGateway();
    const amount = parseUnits('12.5');

    const result = await submitPayment(
      mock.gateway,
      TESTNET_NETWORK_PASSPHRASE,
      {
        source: source.publicKey(),
        signer: source,
        destination: destination.publicKey(),
        assetCode: 'USDC',
        assetIssuer: issuer.publicKey(),
        amount,
      },
    );

    if (!result.ok) throw result.error;
    expect(result.value).toEqual({
      hash: 'paymenthash',
      source: source.publicKey(),
      destination: destination.publicKey(),
      assetCode: 'USDC',
      amount,
    });

    const transaction = mock.submitted[0];
    if (transaction === undefined) throw new Error('no transaction submitted');
    expect(transaction.source).toBe(source.publicKey());
    expect(transaction.networkPassphrase).toBe(TESTNET_NETWORK_PASSPHRASE);
    expect(transaction.signatures).toHaveLength(1);

    const signature = transaction.signatures[0];
    if (signature === undefined) throw new Error('missing signature');
    const signatureBytes = signature.signature();
    expect(source.verify(transaction.hash(), signatureBytes)).toBe(true);
    expect(issuer.verify(transaction.hash(), signatureBytes)).toBe(false);

    const operation = transaction.operations[0] as Operation.Payment;
    expect(operation.type).toBe('payment');
    expect(operation.destination).toBe(destination.publicKey());
    expect(operation.amount).toBe('12.5000000');
    expect(operation.asset.code).toBe('USDC');
    expect(operation.asset.issuer).toBe(issuer.publicKey());
  });

  it('rejects a signer that is not the payment source', async () => {
    const source = Keypair.random();
    const mock = createGateway();

    const result = await submitPayment(
      mock.gateway,
      TESTNET_NETWORK_PASSPHRASE,
      {
        source: source.publicKey(),
        signer: Keypair.random(),
        destination: Keypair.random().publicKey(),
        assetCode: 'USDC',
        assetIssuer: Keypair.random().publicKey(),
        amount: parseUnits('1'),
      },
    );

    expectError(result, 'VALIDATION');
    expect(mock.submitted).toHaveLength(0);
  });

  it('rejects invalid destinations, non-positive amounts, and assets', async () => {
    const source = Keypair.random();
    const issuer = Keypair.random();
    const common = {
      source: source.publicKey(),
      signer: source,
      destination: Keypair.random().publicKey(),
      assetCode: 'USDC',
      assetIssuer: issuer.publicKey(),
      amount: parseUnits('1'),
    };
    const mock = createGateway();

    const badDestination = await submitPayment(
      mock.gateway,
      TESTNET_NETWORK_PASSPHRASE,
      { ...common, destination: 'GNOTAVALIDDESTINATION' },
    );
    const zeroAmount = await submitPayment(
      mock.gateway,
      TESTNET_NETWORK_PASSPHRASE,
      { ...common, amount: parseUnits('0') },
    );
    const badAsset = await submitPayment(
      mock.gateway,
      TESTNET_NETWORK_PASSPHRASE,
      { ...common, assetCode: 'THIS-CODE-IS-TOO-LONG' },
    );

    for (const result of [badDestination, zeroAmount, badAsset]) {
      expectError(result, 'VALIDATION');
    }
    expect(mock.submitted).toHaveLength(0);
  });

  it('converts a submission failure into a CHAIN error', async () => {
    const source = Keypair.random();

    const result = await submitPayment(
      {
        loadAccount: async () => ({ sequenceNumber: () => '1' }),
        submitTransaction: async () => {
          throw new Error('horizon down');
        },
      },
      TESTNET_NETWORK_PASSPHRASE,
      {
        source: source.publicKey(),
        signer: source,
        destination: Keypair.random().publicKey(),
        assetCode: 'USDC',
        assetIssuer: Keypair.random().publicKey(),
        amount: parseUnits('1'),
      },
    );

    expectError(result, 'CHAIN');
  });

  it('converts an account load failure into a CHAIN error', async () => {
    const source = Keypair.random();

    const result = await submitPayment(
      {
        loadAccount: async () => {
          throw new Error('account not found');
        },
        submitTransaction: async () => ({ hash: 'unused' }),
      },
      TESTNET_NETWORK_PASSPHRASE,
      {
        source: source.publicKey(),
        signer: source,
        destination: Keypair.random().publicKey(),
        assetCode: 'USDC',
        assetIssuer: Keypair.random().publicKey(),
        amount: parseUnits('1'),
      },
    );

    expectError(result, 'CHAIN');
  });
});
