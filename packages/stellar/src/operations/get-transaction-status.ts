import { AppError, err, ok, type Result } from '@yieldrail/core';
import { NotFoundError } from '@stellar/stellar-sdk';

import type { HorizonGateway } from '../gateway';

function isNotFound(error: unknown): boolean {
  if (error instanceof NotFoundError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const response = (error as { response?: { status?: number } }).response;
  return response?.status === 404;
}

/**
 * Map a Horizon transaction lookup onto the saga's four states. Horizon does
 * not expose a "pending" record, but a record without a success flag is treated
 * as pending and a 404 as not_found.
 */
export async function getTransactionStatus(
  gateway: HorizonGateway,
  txHash: string,
): Promise<Result<'success' | 'failed' | 'pending' | 'not_found', AppError>> {
  const hash = txHash.trim();
  if (hash === '') {
    return err(new AppError('VALIDATION', 'Transaction hash is required'));
  }

  if (gateway.getTransaction === undefined) {
    return err(
      new AppError('INTERNAL', 'Horizon transaction lookup is not configured'),
    );
  }

  try {
    const record = await gateway.getTransaction(hash);
    if (record.successful === true) return ok('success');
    if (record.successful === false) return ok('failed');
    return ok('pending');
  } catch (error) {
    if (isNotFound(error)) return ok('not_found');
    return err(
      new AppError('CHAIN', 'Failed to read transaction status', error),
    );
  }
}
