import { describe, expect, it } from 'vitest';

import { openDatabase } from './db';
import { defaultMigrationsDir, migrate } from './migrate';

describe('migrate', () => {
  it('runs migrations/0001_ledger.sql and records it', () => {
    const opened = openDatabase(':memory:');
    if (!opened.ok) throw opened.error;

    const db = opened.value;
    try {
      const first = migrate(db, defaultMigrationsDir);
      if (!first.ok) throw first.error;
      expect(first.value).toContain('0001_ledger.sql');

      const tables = (
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as Array<{ name: string }>
      ).map((table) => table.name);
      expect(tables).toEqual(
        expect.arrayContaining([
          'accounts',
          'journal_entries',
          'journal_lines',
          'schema_migrations',
        ]),
      );

      const triggers = (
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
          .all() as Array<{ name: string }>
      ).map((trigger) => trigger.name);
      expect(triggers).toContain('trg_entry_balance');

      const replay = migrate(db, defaultMigrationsDir);
      expect(replay).toEqual({ ok: true, value: [] });
    } finally {
      db.close();
    }
  });
});
