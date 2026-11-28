import { Keypair, type Transaction } from '@stellar/stellar-sdk';
import { parseUnits } from '@yieldrail/core';
import { describe, expect, it } from 'vitest';

import { TESTNET_NETWORK_PASSPHRASE } from '../client';
import type { HorizonGateway, HorizonTransactionRecord } from '../gateway';
import { memoValueForHorizon } from './memo';
import { submitPayment, type SubmitPaymentInput } from './submit-payment';

interface Recorded extends HorizonTransactionRecord {
  readonly successful: boolean;
  readonly source_account: string;
}

function memoFields(transaction: Transaction): {
  memo_type: string;
  memo?: string;
} {
  const memo = transaction.memo;
  if (memo.type === 'none') return { memo_type: 'none' };
  if (memo.type === 'hash' || memo.type === 'return') {
    return {
      memo_type: memo.type,
      memo: Buffer.from(memo.value as Buffer).toString('base64'),
    };
  }
  return { memo_type: memo.type, memo: String(memo.value) };
}

function createGateway() {
  const submitted: Transaction[] = [];
  const records: Recorded[] = [];
  const gateway: HorizonGateway = {
    loadAccount: async () => ({ sequenceNumber: () => '1' }),
    submitTransaction: async (transaction) => {
      submitted.push(transaction);
      const hash = `hash-${submitted.length}`;
      records.push({
        hash,
        successful: true,
        source_account: transaction.source,
        ...memoFields(transaction),
      });
      return { hash };
    },
    getAccountTransactions: async (account) =>
      records.filter((record) => record.source_account === account),
  };

  return { gateway, submitted, records };
}

function payment(
  signer: Keypair,
  issuer: string,
  memo: string,
): SubmitPaymentInput {
  return {
    source: signer.publicKey(),
    signer,
    destination: Keypair.random().publicKey(),
    assetCode: 'USDC',
    assetIssuer: issuer,
    amount: parseUnits('1'),
    memo,
  };
}

describe('submitPayment memo idempotency', () => {
  it('submits once and returns the same hash for a repeated memo', async () => {
    const { gateway, submitted } = createGateway();
    const issuer = Keypair.random();
    const investor = Keypair.random();
    const input = payment(investor, issuer.publicKey(), 'order-1:collect');

    const first = await submitPayment(
      gateway,
      TESTNET_NETWORK_PASSPHRASE,
      input,
    );
    const second = await submitPayment(
      gateway,
      TESTNET_NETWORK_PASSPHRASE,
      input,
    );
    if (!first.ok) throw first.error;
    if (!second.ok) throw second.error;

    expect(first.value.hash).toBe('hash-1');
    expect(second.value.hash).toBe('hash-1');
    expect(submitted).toHaveLength(1);
  });

  it('attaches a hashed memo for long order ids', async () => {
    const { gateway, submitted } = createGateway();
    const issuer = Keypair.random();
    const memo = `${'a'.repeat(36)}:collect`;

    const result = await submitPayment(
      gateway,
      TESTNET_NETWORK_PASSPHRASE,
      payment(Keypair.random(), issuer.publicKey(), memo),
    );
    if (!result.ok) throw result.error;

    const transaction = submitted[0];
    if (transaction === undefined) throw new Error('no transaction submitted');
    expect(transaction.memo.type).toBe('hash');
    expect(transaction.memo.value).toEqual(
      Buffer.from(memoValueForHorizon(memo).memo, 'base64'),
    );
  });

  it('submits a new payment when the memo differs', async () => {
    const { gateway, submitted } = createGateway();
    const issuer = Keypair.random();
    const investor = Keypair.random();

    const first = await submitPayment(
      gateway,
      TESTNET_NETWORK_PASSPHRASE,
      payment(investor, issuer.publicKey(), 'order-1:collect'),
    );
    const second = await submitPayment(
      gateway,
      TESTNET_NETWORK_PASSPHRASE,
      payment(investor, issuer.publicKey(), 'order-1:mint'),
    );
    if (!first.ok) throw first.error;
    if (!second.ok) throw second.error;

    expect(submitted).toHaveLength(2);
    expect(first.value.hash).toBe('hash-1');
    expect(second.value.hash).toBe('hash-2');
  });

  it('ignores a failed transaction with the same memo', async () => {
    const { gateway, submitted, records } = createGateway();
    const issuer = Keypair.random();
    const investor = Keypair.random();
    const memo = 'order-1:collect';

    records.push({
      hash: 'failed-hash',
      successful: false,
      source_account: investor.publicKey(),
      ...memoValueForHorizon(memo),
    });

    const result = await submitPayment(
      gateway,
      TESTNET_NETWORK_PASSPHRASE,
      payment(investor, issuer.publicKey(), memo),
    );
    if (!result.ok) throw result.error;

    expect(result.value.hash).toBe('hash-1');
    expect(submitted).toHaveLength(1);
  });

  it('returns CHAIN when the source transaction scan fails', async () => {
    const { gateway } = createGateway();
    const failing: HorizonGateway = {
      ...gateway,
      getAccountTransactions: async () => {
        throw new Error('horizon down');
      },
    };

    const result = await submitPayment(
      failing,
      TESTNET_NETWORK_PASSPHRASE,
      payment(Keypair.random(), Keypair.random().publicKey(), 'order-1:collect'),
    );
    if (result.ok) throw new Error('expected a chain error');
    expect(result.error.code).toBe('CHAIN');
  });
});
