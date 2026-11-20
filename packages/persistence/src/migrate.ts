import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { err, ok, type AppError, type Result } from '@yieldrail/core';
import { mapSqliteError, openDatabase, type Db } from './db';

export interface Migration {
  /** File name, used as the stable migration ID. */
  id: string;
  sql: string;
}

/** Repo-root migrations directory, resolved from this source file. */
export const defaultMigrationsDir = fileURLToPath(
  new URL('../../../migrations', import.meta.url),
);

function loadMigrations(migrationsDir: string): Migration[] {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({
      id: file,
      sql: readFileSync(join(migrationsDir, file), 'utf8'),
    }));
}

/**
 * Apply pending .sql migrations in one transaction and return their IDs.
 * Re-runs skip already-recorded migrations. Migrations must not contain
 * their own BEGIN/COMMIT.
 */
export function migrate(
  db: Db,
  migrationsDir: string = defaultMigrationsDir,
): Result<string[], AppError> {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )
    `);

    const appliedRows = db
      .prepare('SELECT id FROM schema_migrations')
      .all() as Array<{ id: string }>;
    const applied = new Set(appliedRows.map((row) => row.id));
    const pending = loadMigrations(migrationsDir).filter(
      (migration) => !applied.has(migration.id),
    );

    const record = db.prepare('INSERT INTO schema_migrations (id) VALUES (?)');
    const applyAll = db.transaction((migrations: Migration[]) => {
      for (const migration of migrations) {
        db.exec(migration.sql);
        record.run(migration.id);
      }
    });
    applyAll(pending);

    return ok(pending.map((migration) => migration.id));
  } catch (error) {
    return err(mapSqliteError(error));
  }
}

export interface MigratedDatabaseOptions {
  /** SQLite file path, or ':memory:' for tests. */
  filename: string;
  /** Defaults to the repo's migrations/ directory. */
  migrationsDir?: string;
}

/** Open a database and bring it up to date, closing it if migration fails. */
export function openMigratedDatabase(
  options: MigratedDatabaseOptions,
): Result<Db, AppError> {
  const opened = openDatabase(options.filename);
  if (!opened.ok) return opened;

  const db = opened.value;
  const migrated = migrate(db, options.migrationsDir ?? defaultMigrationsDir);
  if (!migrated.ok) {
    db.close();
    return migrated;
  }

  return ok(db);
}
