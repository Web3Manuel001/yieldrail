import { parseUnits } from '@yieldrail/core';
import { afterEach, describe, expect, it } from 'vitest';

import type { Db } from './db';
import { SqliteLedgerAdapter } from './ledger.adapter';
import { openMigratedDatabase } from './migrate';

const openDbs: Db[] = [];

function setup(): { db: Db; ledger: SqliteLedgerAdapter } {
  const opened = openMigratedDatabase({ filename: ':memory:' });
  if (!opened.ok) throw opened.error;

  const db = opened.value;
  openDbs.push(db);
  return { db, ledger: new SqliteLedgerAdapter(db) };
}

afterEach(() => {
  for (const db of openDbs.splice(0)) db.close();
});

describe('SqliteLedgerAdapter', () => {
  it('posts balanced USDC and USTBL legs for a subscription', () => {
    const { db, ledger } = setup();

    const result = ledger.postSubscribe({
      orderId: 'ord-1',
      investorId: 'inv-1',
      productId: 'USTBL',
      usdcAmountMinor: parseUnits('100'),
      sharesMinor: parseUnits('99.5'),
      effectiveDate: '2026-11-23',
    });
    if (!result.ok) throw result.error;

    const entry = db
      .prepare(
        'SELECT posted FROM journal_entries WHERE id = ?',
      )
      .get('subscribe:ord-1') as { posted: bigint } | undefined;
    expect(entry?.posted).toBe(1n);

    const totals = db
      .prepare(
        `SELECT asset, direction, SUM(amount_minor) AS total
           FROM journal_lines
          WHERE entry_id = ?
          GROUP BY asset, direction`,
      )
      .all('subscribe:ord-1') as Array<{
      asset: string;
      direction: string;
      total: bigint;
    }>;

    const byKey = new Map(
      totals.map((row) => [`${row.asset}:${row.direction}`, row.total]),
    );
    expect(byKey.get('USDC:DEBIT')).toBe(1_000_000_000n);
    expect(byKey.get('USDC:CREDIT')).toBe(1_000_000_000n);
    expect(byKey.get('USTBL:DEBIT')).toBe(995_000_000n);
    expect(byKey.get('USTBL:CREDIT')).toBe(995_000_000n);
  });

  it('is idempotent per order and does not duplicate the journal entry', () => {
    const { db, ledger } = setup();
    const input = {
      orderId: 'ord-1',
      investorId: 'inv-1',
      productId: 'USTBL',
      usdcAmountMinor: parseUnits('100'),
      sharesMinor: parseUnits('100'),
      effectiveDate: '2026-11-23',
    };

    const first = ledger.postSubscribe(input);
    const second = ledger.postSubscribe(input);
    if (!first.ok) throw first.error;
    if (!second.ok) throw second.error;

    const entries = db
      .prepare('SELECT COUNT(*) AS count FROM journal_entries')
      .get() as { count: bigint };
    const lines = db
      .prepare('SELECT COUNT(*) AS count FROM journal_lines')
      .get() as { count: bigint };

    expect(entries.count).toBe(1n);
    expect(lines.count).toBe(4n);
  });
});
