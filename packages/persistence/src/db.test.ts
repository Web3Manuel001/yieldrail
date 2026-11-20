import { stroops } from '@yieldrail/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, postEntry, type Db } from './db';
import { defaultMigrationsDir, migrate } from './migrate';

function createLedger(): Db {
  const opened = openDatabase(':memory:');
  if (!opened.ok) throw opened.error;

  const db = opened.value;
  const migrated = migrate(db, defaultMigrationsDir);
  if (!migrated.ok) {
    db.close();
    throw migrated.error;
  }

  const insertAccount = db.prepare(
    'INSERT INTO accounts (id, type, owner, asset) VALUES (?, ?, ?, ?)',
  );
  insertAccount.run('acct-asset', 'ASSET', 'platform', 'USDC');
  insertAccount.run('acct-liability', 'LIABILITY', 'platform', 'USDC');

  return db;
}

describe('postEntry', () => {
  let db: Db;

  beforeEach(() => {
    db = createLedger();
  });

  afterEach(() => {
    db.close();
  });

  it('posts a balanced entry through insert -> lines -> posted protocol', () => {
    const result = postEntry(db, {
      entryId: 'entry-balanced',
      eventId: 'event-balanced',
      effectiveDate: '2026-11-20',
      ref: 'test',
      lines: [
        {
          accountId: 'acct-asset',
          asset: 'USDC',
          direction: 'DEBIT',
          amountMinor: stroops(100n),
        },
        {
          accountId: 'acct-liability',
          asset: 'USDC',
          direction: 'CREDIT',
          amountMinor: stroops(100n),
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      value: { entryId: 'entry-balanced' },
    });

    const entry = db
      .prepare('SELECT posted FROM journal_entries WHERE id = ?')
      .get('entry-balanced') as { posted: bigint } | undefined;
    expect(entry?.posted).toBe(1n);

    const lines = db
      .prepare(
        'SELECT amount_minor FROM journal_lines WHERE entry_id = ? ORDER BY id',
      )
      .all('entry-balanced') as Array<{ amount_minor: bigint }>;
    expect(lines.map((line) => line.amount_minor)).toEqual([100n, 100n]);
  });

  it('rejects an unbalanced entry through the balance trigger', () => {
    const result = postEntry(db, {
      entryId: 'entry-unbalanced',
      eventId: 'event-unbalanced',
      effectiveDate: '2026-11-20',
      lines: [
        {
          accountId: 'acct-asset',
          asset: 'USDC',
          direction: 'DEBIT',
          amountMinor: stroops(100n),
        },
        {
          accountId: 'acct-liability',
          asset: 'USDC',
          direction: 'CREDIT',
          amountMinor: stroops(99n),
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected unbalanced entry to fail');
    expect(result.error.code).toBe('LEDGER_UNBALANCED');

    const entry = db
      .prepare('SELECT id FROM journal_entries WHERE id = ?')
      .get('entry-unbalanced');
    expect(entry).toBeUndefined();

    const lineCount = db
      .prepare('SELECT COUNT(*) AS count FROM journal_lines')
      .get() as { count: bigint };
    expect(lineCount.count).toBe(0n);
  });
});
