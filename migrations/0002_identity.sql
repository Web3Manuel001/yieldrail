PRAGMA foreign_keys = ON;

CREATE TABLE investors (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  jurisdiction TEXT NOT NULL CHECK (length(jurisdiction) = 2),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE investor_eligibility (
  investor_id TEXT NOT NULL REFERENCES investors(id),
  product_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  jurisdiction TEXT NOT NULL CHECK (length(jurisdiction) = 2),
  tier TEXT NOT NULL CHECK (tier IN ('retail', 'accredited')),
  eligible_at TEXT NOT NULL,
  authorization_tx_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (investor_id, product_id)
);
