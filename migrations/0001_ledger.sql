PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('ASSET','LIABILITY','INCOME','EXPENSE','SUSPENSE','ROUNDING')),
  owner TEXT NOT NULL, asset TEXT NOT NULL, chain TEXT NOT NULL DEFAULT 'stellar',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE,
  effective_date TEXT NOT NULL, system_date TEXT NOT NULL DEFAULT (datetime('now')),
  ref TEXT, posted INTEGER NOT NULL DEFAULT 0 CHECK (posted IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE journal_lines (
  id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES journal_entries(id),
  account_id TEXT NOT NULL REFERENCES accounts(id), asset TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0), tx_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX ux_line_idem ON journal_lines(entry_id, account_id, asset, direction);

CREATE TRIGGER trg_lines_no_update BEFORE UPDATE ON journal_lines
BEGIN SELECT RAISE(ABORT,'ledger lines are append-only'); END;
CREATE TRIGGER trg_lines_no_delete BEFORE DELETE ON journal_lines
BEGIN SELECT RAISE(ABORT,'ledger lines are append-only'); END;
CREATE TRIGGER trg_entries_immutable BEFORE UPDATE ON journal_entries WHEN OLD.posted = 1
BEGIN SELECT RAISE(ABORT,'posted entries are immutable'); END;

CREATE TRIGGER trg_entry_balance BEFORE UPDATE ON journal_entries
WHEN NEW.posted = 1 AND OLD.posted = 0
BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM journal_lines WHERE entry_id = NEW.id) = 0
    THEN RAISE(ABORT,'empty entry') END;
  SELECT CASE WHEN EXISTS (
    SELECT asset FROM journal_lines WHERE entry_id = NEW.id GROUP BY asset
    HAVING SUM(CASE WHEN direction='DEBIT' THEN amount_minor ELSE 0 END)
        <> SUM(CASE WHEN direction='CREDIT' THEN amount_minor ELSE 0 END)
  ) THEN RAISE(ABORT,'unbalanced entry: debits != credits per asset') END;
END;
