import { Memo } from '@stellar/stellar-sdk';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { memoFor, memoMatches, memoValueForHorizon } from './memo';

const SHORT = 'order:collect';
const LONG = `${'a'.repeat(36)}:collect`;

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64');
}

describe('chain memo encoding', () => {
  it('keeps short memos as text', () => {
    const memo = memoFor(SHORT);
    expect(memo.type).toBe('text');
    expect(memo.value).toBe(SHORT);
    expect(memoValueForHorizon(SHORT)).toEqual({
      memo_type: 'text',
      memo: SHORT,
    });
  });

  it('hashes memos longer than the 28-byte text limit', () => {
    const memo = memoFor(LONG);
    expect(memo.type).toBe('hash');
    expect(Buffer.from(memo.value as Buffer).toString('base64')).toBe(
      digest(LONG),
    );
    expect(memoValueForHorizon(LONG)).toEqual({
      memo_type: 'hash',
      memo: digest(LONG),
    });
  });

  it('matches only records with the same memo type and value', () => {
    expect(
      memoMatches({ hash: 'h', ...memoValueForHorizon(LONG) }, LONG),
    ).toBe(true);
    expect(
      memoMatches({ hash: 'h', memo_type: 'text', memo: LONG }, LONG),
    ).toBe(false);
    expect(memoMatches({ hash: 'h' }, LONG)).toBe(false);
  });

  it('exposes the SDK memo value for hash memos', () => {
    const memo = memoFor(LONG);
    expect(memo).toBeInstanceOf(Memo);
  });
});
