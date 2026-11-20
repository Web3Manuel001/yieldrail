import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createDatabase, runMigrations } from '../src/index.js';

describe('migrations runner', () => {
  const migrationsDir = mkdtempSync(join(tmpdir(), 'yieldrail-migrations-'));

  afterAll(() => {
    rmSync(migrationsDir, { recursive: true, force: true });
  });

  it('applies pending migrations exactly once', () => {
    writeFileSync(
      join(migrationsDir, '001_create_accounts.sql'),
      'CREATE TABLE accounts (id TEXT PRIMARY KEY);',
    );
    writeFileSync(
      join(migrationsDir, '002_add_owner.sql'),
      'ALTER TABLE accounts ADD COLUMN owner TEXT;',
    );

    const db = createDatabase({ filename: ':memory:', migrationsDir });
    try {
      const replayed = runMigrations(db, migrationsDir);
      expect(replayed).toEqual([]);

      const columns = db
        .prepare('PRAGMA table_info(accounts)')
        .all() as Array<{ name: string }>;
      expect(columns.map((column) => column.name)).toEqual(['id', 'owner']);
    } finally {
      db.close();
    }
  });
});
