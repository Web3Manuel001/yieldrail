PRAGMA foreign_keys = ON;

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  investor_id TEXT NOT NULL REFERENCES investors(id),
  product_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('subscribe', 'redeem')),
  status TEXT NOT NULL CHECK (
    status IN ('PENDING', 'COLLECTING', 'MINTING', 'SETTLED', 'FAILED', 'REFUNDED')
  ),
  usdc_amount_minor INTEGER NOT NULL CHECK (usdc_amount_minor > 0),
  shares_minor INTEGER NOT NULL CHECK (shares_minor > 0),
  nav_scaled INTEGER NOT NULL CHECK (nav_scaled > 0),
  collect_tx_hash TEXT,
  mint_tx_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX ix_orders_investor ON orders (investor_id, product_id);
CREATE INDEX ix_orders_status ON orders (status);
