import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import Database from 'better-sqlite3';

export type Db = Database.Database;

export interface Migration {
  /** File name, used as the stable migration ID. */
  id: string;
  sql: string;
}

export interface DatabaseOptions {
  /** SQLite file path, or ':memory:' for an in-memory database. */
  filename: string;
  /** Directory containing ordered .sql migration files. */
  migrationsDir: string;
}

/**
 * Open a SQLite connection with the pragmas the app relies on.
 * Parent directories are created automatically for file-backed databases.
 */
export function openDatabase(filename: string): Db {
  const inMemory = filename === ':memory:';
  if (!inMemory) {
    mkdirSync(dirname(filename), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (!inMemory) {
    db.pragma('journal_mode = WAL');
  }
  return db;
}

/** Load .sql migrations in file-name order. Migrations must not contain BEGIN/COMMIT. */
export function loadMigrations(migrationsDir: string): Migration[] {
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
 * Apply pending migrations in a single transaction and return their IDs.
 * Already-applied migrations are skipped, so repeat runs are safe.
 */
export function runMigrations(db: Db, migrationsDir: string): string[] {
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

  return pending.map((migration) => migration.id);
}

/** Open a database and bring it up to date. Closes the handle if migration fails. */
export function createDatabase(options: DatabaseOptions): Db {
  const db = openDatabase(options.filename);
  try {
    runMigrations(db, options.migrationsDir);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
