-- Order saga fields: pricing remainder, refund hash, and the SUSPENSE outcome.
-- SQLite cannot alter a CHECK constraint in place, so rebuild the table.

CREATE TABLE orders_new (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  investor_id TEXT NOT NULL REFERENCES investors(id),
  product_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('subscribe', 'redeem')),
  status TEXT NOT NULL CHECK (
    status IN (
      'PENDING', 'COLLECTING', 'MINTING', 'SETTLED',
      'FAILED', 'REFUNDED', 'SUSPENSE'
    )
  ),
  usdc_amount_minor INTEGER NOT NULL CHECK (usdc_amount_minor > 0),
  shares_minor INTEGER NOT NULL CHECK (shares_minor > 0),
  nav_scaled INTEGER NOT NULL CHECK (nav_scaled > 0),
  remainder_minor INTEGER NOT NULL DEFAULT 0 CHECK (remainder_minor >= 0),
  collect_tx_hash TEXT,
  mint_tx_hash TEXT,
  refund_tx_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO orders_new (
  id, idempotency_key, investor_id, product_id, kind, status,
  usdc_amount_minor, shares_minor, nav_scaled,
  collect_tx_hash, mint_tx_hash, created_at, updated_at
)
SELECT
  id, idempotency_key, investor_id, product_id, kind, status,
  usdc_amount_minor, shares_minor, nav_scaled,
  collect_tx_hash, mint_tx_hash, created_at, updated_at
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX ix_orders_investor ON orders (investor_id, product_id);
CREATE INDEX ix_orders_status ON orders (status);
