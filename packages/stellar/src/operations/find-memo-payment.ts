import { AppError, err, ok, type Result } from '@yieldrail/core';

import type { HorizonGateway } from '../gateway';
import { memoMatches } from './memo';

/**
 * Find a successful transaction already submitted by `source` with the same
 * memo. Returning its hash makes a payment retry idempotent at the chain level.
 */
export async function findSuccessfulPaymentByMemo(
  gateway: HorizonGateway,
  source: string,
  memo: string,
): Promise<Result<string | null, AppError>> {
  if (gateway.getAccountTransactions === undefined) {
    return err(
      new AppError('INTERNAL', 'Horizon transaction lookup is not configured'),
    );
  }

  try {
    const recent = await gateway.getAccountTransactions(source, {
      limit: 50,
      order: 'desc',
    });
    const match = recent.find(
      (record) =>
        record.successful === true &&
        record.source_account === source &&
        memoMatches(record, memo),
    );
    return ok(match?.hash ?? null);
  } catch (error) {
    return err(
      new AppError('CHAIN', 'Failed to scan source account transactions', error),
    );
  }
}
