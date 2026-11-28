import { describe, expect, it } from 'vitest';

import type { HorizonGateway } from '../gateway';
import { getTransactionStatus } from './get-transaction-status';

function gateway(
  getTransaction?: HorizonGateway['getTransaction'],
): HorizonGateway {
  return {
    loadAccount: async () => ({ sequenceNumber: () => '1' }),
    submitTransaction: async () => ({ hash: 'unused' }),
    ...(getTransaction === undefined ? {} : { getTransaction }),
  };
}

function notFound(): Error {
  return Object.assign(new Error('not found'), { response: { status: 404 } });
}

describe('getTransactionStatus', () => {
  it('maps a successful Horizon record to success', async () => {
    const result = await getTransactionStatus(
      gateway(async () => ({ hash: 'abc', successful: true })),
      'abc',
    );
    if (!result.ok) throw result.error;
    expect(result.value).toBe('success');
  });

  it('maps a failed Horizon record to failed', async () => {
    const result = await getTransactionStatus(
      gateway(async () => ({ hash: 'abc', successful: false })),
      'abc',
    );
    if (!result.ok) throw result.error;
    expect(result.value).toBe('failed');
  });

  it('treats a record without an outcome as pending', async () => {
    const result = await getTransactionStatus(
      gateway(async () => ({ hash: 'abc' })),
      'abc',
    );
    if (!result.ok) throw result.error;
    expect(result.value).toBe('pending');
  });

  it('maps a Horizon 404 to not_found', async () => {
    const result = await getTransactionStatus(
      gateway(async () => {
        throw notFound();
      }),
      'abc',
    );
    if (!result.ok) throw result.error;
    expect(result.value).toBe('not_found');
  });

  it('maps other Horizon failures to CHAIN', async () => {
    const result = await getTransactionStatus(
      gateway(async () => {
        throw new Error('horizon down');
      }),
      'abc',
    );
    if (result.ok) throw new Error('expected a chain error');
    expect(result.error.code).toBe('CHAIN');
  });

  it('rejects a blank hash before touching Horizon', async () => {
    const result = await getTransactionStatus(gateway(), '  ');
    if (result.ok) throw new Error('expected a validation error');
    expect(result.error.code).toBe('VALIDATION');
  });

  it('reports missing transaction lookup wiring', async () => {
    const result = await getTransactionStatus(gateway(), 'abc');
    if (result.ok) throw new Error('expected an internal error');
    expect(result.error.code).toBe('INTERNAL');
  });
});
