import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';
import { AppError, err, ok, type Result, type Stroops } from '@yieldrail/core';

export type Db = Database.Database;

/** Map adapter-level throws to the shared error type before crossing a boundary. */
export function mapSqliteError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('unbalanced entry') || message.includes('empty entry')) {
    return new AppError('LEDGER_UNBALANCED', message, error);
  }
  if (message.includes('UNIQUE constraint failed')) {
    return new AppError('CONFLICT', message, error);
  }
  if (message.includes('FOREIGN KEY constraint failed')) {
    return new AppError('VALIDATION', message, error);
  }
  return new AppError('INTERNAL', message, error);
}

/**
 * Open a SQLite connection with the pragmas the ledger relies on.
 * Money columns are always read as bigint via defaultSafeIntegers.
 */
export function openDatabase(filename: string): Result<Db, AppError> {
  let db: Db | undefined;
  try {
    const inMemory = filename === ':memory:';
    if (!inMemory) {
      mkdirSync(dirname(filename), { recursive: true });
    }

    db = new Database(filename);
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    if (!inMemory) {
      db.pragma('journal_mode = WAL');
    }
    db.defaultSafeIntegers(true);

    return ok(db);
  } catch (error) {
    db?.close();
    return err(mapSqliteError(error));
  }
}

export interface JournalLineInput {
  accountId: string;
  asset: string;
  direction: 'DEBIT' | 'CREDIT';
  amountMinor: Stroops;
  txHash?: string;
}

export interface PostEntryInput {
  entryId: string;
  eventId: string;
  effectiveDate: string;
  ref?: string;
  lines: readonly JournalLineInput[];
}

export interface PostedEntry {
  entryId: string;
}

/**
 * Post a double-entry journal entry using the required protocol:
 * insert entry (posted=0) -> insert lines -> update entry (posted=1).
 * The balance trigger aborts the transaction if debits != credits per asset.
 */
export function postEntry(
  db: Db,
  input: PostEntryInput,
): Result<PostedEntry, AppError> {
  try {
    const insertEntry = db.prepare(`
      INSERT INTO journal_entries (id, event_id, effective_date, ref, posted)
      VALUES (?, ?, ?, ?, 0)
    `);
    const insertLine = db.prepare(`
      INSERT INTO journal_lines
        (id, entry_id, account_id, asset, direction, amount_minor, tx_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const markPosted = db.prepare(
      'UPDATE journal_entries SET posted = 1 WHERE id = ?',
    );

    const post = db.transaction(() => {
      insertEntry.run(
        input.entryId,
        input.eventId,
        input.effectiveDate,
        input.ref ?? null,
      );

      input.lines.forEach((line, index) => {
        insertLine.run(
          `${input.entryId}:${index}`,
          input.entryId,
          line.accountId,
          line.asset,
          line.direction,
          line.amountMinor,
          line.txHash ?? null,
        );
      });

      markPosted.run(input.entryId);
    });

    post();
    return ok({ entryId: input.entryId });
  } catch (error) {
    return err(mapSqliteError(error));
  }
}
