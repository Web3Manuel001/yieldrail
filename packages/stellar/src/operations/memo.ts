import { createHash } from 'node:crypto';

import { Memo } from '@stellar/stellar-sdk';

import type { HorizonTransactionRecord } from '../gateway';

/** Stellar text memos are limited to 28 bytes. */
const MEMO_TEXT_MAX_BYTES = 28;

function digest(memo: string): Buffer {
  return createHash('sha256').update(memo, 'utf8').digest();
}

/**
 * Build the on-chain memo for a leg. Short values stay readable text; long
 * values (order UUID + leg) are hashed so the 28-byte text limit cannot cause
 * collisions or truncation.
 */
export function memoFor(memo: string): Memo {
  return Buffer.byteLength(memo, 'utf8') <= MEMO_TEXT_MAX_BYTES
    ? Memo.text(memo)
    : Memo.hash(digest(memo));
}

export interface HorizonMemoFields {
  readonly memo: string;
  readonly memo_type: string;
}

/** The Horizon wire representation used to match a submitted memo. */
export function memoValueForHorizon(memo: string): HorizonMemoFields {
  if (Buffer.byteLength(memo, 'utf8') <= MEMO_TEXT_MAX_BYTES) {
    return { memo_type: 'text', memo };
  }
  return { memo_type: 'hash', memo: digest(memo).toString('base64') };
}

/** Whether a Horizon transaction carries the expected memo. */
export function memoMatches(
  record: HorizonTransactionRecord,
  memo: string,
): boolean {
  const expected = memoValueForHorizon(memo);
  return (
    record.memo_type === expected.memo_type && record.memo === expected.memo
  );
}
