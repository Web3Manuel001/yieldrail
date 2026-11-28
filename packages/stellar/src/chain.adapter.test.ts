import { Keypair, Operation, type Transaction } from '@stellar/stellar-sdk';
import { parseUnits } from '@yieldrail/core';
import { describe, expect, it } from 'vitest';

import { StellarChainAdapter } from './chain.adapter';
import { TESTNET_NETWORK_PASSPHRASE } from './client';
import type { AccountBalance, HorizonGateway } from './gateway';

function createGateway(balances: readonly AccountBalance[] = []): {
  gateway: HorizonGateway;
  submitted: Transaction[];
} {
  const submitted: Transaction[] = [];
  return {
    submitted,
    gateway: {
      loadAccount: async () => ({ sequenceNumber: () => '1', balances }),
      submitTransaction: async (transaction) => {
        submitted.push(transaction);
        return { hash: 'adapterhash' };
      },
    },
  };
}

describe('StellarChainAdapter payment and balance operations', () => {
  it('signs payments with the configured source signer and resolves asset issuers', async () => {
    const issuer = Keypair.random();
    const investor = Keypair.random();
    const usdcIssuer = Keypair.random().publicKey();
    const destination = Keypair.random().publicKey();
    const mock = createGateway();
    const adapter = new StellarChainAdapter({
      gateway: mock.gateway,
      networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
      issuer: issuer.publicKey(),
      signer: issuer,
      assetIssuers: { USDC: usdcIssuer },
      signers: { [investor.publicKey()]: investor },
    });

    const result = await adapter.submitPayment(
      investor.publicKey(),
      destination,
      'USDC',
      parseUnits('2'),
    );

    if (!result.ok) throw result.error;
    expect(result.value).toBe('adapterhash');

    const transaction = mock.submitted[0];
    if (transaction === undefined) throw new Error('no transaction submitted');
    expect(transaction.source).toBe(investor.publicKey());
    const operation = transaction.operations[0] as Operation.Payment;
    expect(operation.asset.code).toBe('USDC');
    expect(operation.asset.issuer).toBe(usdcIssuer);
  });

  it('rejects a payment source with no configured signer', async () => {
    const issuer = Keypair.random();
    const mock = createGateway();
    const adapter = new StellarChainAdapter({
      gateway: mock.gateway,
      networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
      issuer: issuer.publicKey(),
      signer: issuer,
    });

    const result = await adapter.submitPayment(
      Keypair.random().publicKey(),
      Keypair.random().publicKey(),
      'USTBL',
      parseUnits('1'),
    );

    if (result.ok) throw new Error('expected missing signer to fail');
    expect(result.error.code).toBe('VALIDATION');
    expect(mock.submitted).toHaveLength(0);
  });

  it('reads balances using the per-asset issuer', async () => {
    const issuer = Keypair.random();
    const usdcIssuer = Keypair.random().publicKey();
    const account = Keypair.random().publicKey();
    const mock = createGateway([
      {
        asset_type: 'credit_alphanum4',
        asset_code: 'USDC',
        asset_issuer: usdcIssuer,
        balance: '7.5000000',
      },
      {
        asset_type: 'credit_alphanum4',
        asset_code: 'USTBL',
        asset_issuer: issuer.publicKey(),
        balance: '1.2500000',
      },
    ]);
    const adapter = new StellarChainAdapter({
      gateway: mock.gateway,
      networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
      issuer: issuer.publicKey(),
      signer: issuer,
      assetIssuers: { USDC: usdcIssuer },
    });

    const usdc = await adapter.getBalance(account, 'USDC');
    const ustbl = await adapter.getBalance(account, 'USTBL');
    if (!usdc.ok) throw usdc.error;
    if (!ustbl.ok) throw ustbl.error;

    expect(usdc.value).toBe(75_000_000n);
    expect(ustbl.value).toBe(12_500_000n);
  });

  it('looks up transaction status through the gateway', async () => {
    const issuer = Keypair.random();
    const mock = createGateway();
    const adapter = new StellarChainAdapter({
      gateway: {
        ...mock.gateway,
        getTransaction: async () => ({ hash: 'abc', successful: true }),
      },
      networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
      issuer: issuer.publicKey(),
      signer: issuer,
    });

    const result = await adapter.getTransactionStatus('abc');
    if (!result.ok) throw result.error;
    expect(result.value).toBe('success');
  });
});
