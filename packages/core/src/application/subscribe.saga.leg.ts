import type { ChainPort, TxStatus } from '../ports/chain.port';
import { AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';

export type SagaLeg = 'collect' | 'mint' | 'refund';

/** What a recorded leg means for the next saga step. */
export type LegDecision = 'confirmed' | 'retry';

/** Deterministic memo that makes a leg idempotent at the chain level. */
export function legMemo(orderId: string, leg: SagaLeg): string {
  return `${orderId}:${leg}`;
}

function decide(
  status: TxStatus,
  leg: SagaLeg,
  hash: string,
): Result<LegDecision, AppError> {
  switch (status) {
    case 'success':
      return ok('confirmed');
    case 'failed':
      // A failed tx moved no value; the memo is not a successful match, so a
      // retry with the same memo is safe.
      return ok('retry');
    case 'pending':
    case 'not_found':
      // The hash was recorded after submission, so a blind retry could pay
      // twice while Horizon has not indexed it yet.
      return err(
        new AppError(
          'CONFLICT',
          `Waiting for ${leg} transaction ${hash} (${status})`,
        ),
      );
  }
}

/**
 * Decide whether a recorded leg is confirmed, can be retried, or must wait.
 * Waiting leaves the order in its current status so a later request resumes.
 */
export async function recordedLeg(
  chain: ChainPort,
  hash: string | null,
  leg: SagaLeg,
): Promise<Result<LegDecision, AppError>> {
  if (hash === null) return ok('retry');

  const status = await chain.getTransactionStatus(hash);
  if (!status.ok) return status;

  return decide(status.value, leg, hash);
}
