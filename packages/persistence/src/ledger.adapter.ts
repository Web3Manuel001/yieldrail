import {
  AppError,
  err,
  ok,
  type LedgerPort,
  type PostSubscribeLedgerInput,
  type Result,
  type Stroops,
} from '@yieldrail/core';

import {
  mapSqliteError,
  postEntry,
  type AccountSeed,
  type Db,
  type JournalLineInput,
} from './db';

const USDC = 'USDC';
const USTBL = 'USTBL';

const ACCOUNTS: readonly AccountSeed[] = [
  { id: 'investor_cash.USDC', type: 'ASSET', owner: 'investor', asset: USDC },
  {
    id: 'issuer_clearing.USDC',
    type: 'LIABILITY',
    owner: 'issuer',
    asset: USDC,
  },
  {
    id: 'investor_position.USTBL',
    type: 'ASSET',
    owner: 'investor',
    asset: USTBL,
  },
  {
    id: 'issuer_clearing.USTBL',
    type: 'LIABILITY',
    owner: 'issuer',
    asset: USTBL,
  },
];

function subscribeLines(
  usdcAmountMinor: Stroops,
  sharesMinor: Stroops,
): readonly JournalLineInput[] {
  return [
    {
      accountId: 'investor_cash.USDC',
      asset: USDC,
      direction: 'DEBIT',
      amountMinor: usdcAmountMinor,
    },
    {
      accountId: 'issuer_clearing.USDC',
      asset: USDC,
      direction: 'CREDIT',
      amountMinor: usdcAmountMinor,
    },
    {
      accountId: 'investor_position.USTBL',
      asset: USTBL,
      direction: 'DEBIT',
      amountMinor: sharesMinor,
    },
    {
      accountId: 'issuer_clearing.USTBL',
      asset: USTBL,
      direction: 'CREDIT',
      amountMinor: sharesMinor,
    },
  ];
}

/** SQLite ledger adapter for order settlement. Idempotent per order. */
export class SqliteLedgerAdapter implements LedgerPort {
  constructor(private readonly db: Db) {}

  postSubscribe(input: PostSubscribeLedgerInput): Result<void, AppError> {
    const entryId = `subscribe:${input.orderId}`;

    try {
      const result = postEntry(this.db, {
        entryId,
        eventId: `order.settled:${input.orderId}`,
        effectiveDate: input.effectiveDate,
        ref: input.orderId,
        lines: subscribeLines(input.usdcAmountMinor, input.sharesMinor),
        accounts: ACCOUNTS,
      });
      if (result.ok) return ok(undefined);

      if (result.error.code === 'CONFLICT') {
        const existing = this.db
          .prepare('SELECT posted FROM journal_entries WHERE id = ?')
          .get(entryId) as { posted: bigint } | undefined;
        if (existing?.posted === 1n) return ok(undefined);
      }

      return result;
    } catch (error) {
      return err(mapSqliteError(error));
    }
  }
}
