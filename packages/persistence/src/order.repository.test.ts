import { parseUnits } from '@yieldrail/core';
import { afterEach, describe, expect, it } from 'vitest';

import type { Db } from './db';
import { openMigratedDatabase } from './migrate';
import { SqliteOrderRepository } from './order.repository';
import type { ReserveOrderInput } from '@yieldrail/core';

const NOW = new Date('2026-11-22T10:00:00.000Z');

const ORDER: ReserveOrderInput = {
  idempotencyKey: 'idem-001',
  investorId: 'inv-001',
  productId: 'USTBL',
  kind: 'subscribe',
  usdcAmountMinor: parseUnits('100'),
  sharesMinor: parseUnits('99.5'),
  navScaled: 10_000_000n,
};

const openDbs: Db[] = [];

function setup(): {
  db: Db;
  repo: SqliteOrderRepository;
} {
  const opened = openMigratedDatabase({ filename: ':memory:' });
  if (!opened.ok) throw opened.error;

  const db = opened.value;
  openDbs.push(db);
  db.prepare(
    'INSERT INTO investors (id, wallet_address, jurisdiction) VALUES (?, ?, ?)',
  ).run('inv-001', 'GWALLET', 'NG');

  let sequence = 0;
  const repo = new SqliteOrderRepository(db, {
    now: () => NOW,
    generateId: () => `ord-${++sequence}`,
  });
  return { db, repo };
}

afterEach(() => {
  for (const db of openDbs.splice(0)) db.close();
});

describe('SqliteOrderRepository', () => {
  it('reserves an order in PENDING with bigint amounts', () => {
    const { repo } = setup();

    const reserved = repo.reserve(ORDER);
    if (!reserved.ok) throw reserved.error;

    expect(reserved.value.created).toBe(true);
    expect(reserved.value.order).toMatchObject({
      id: 'ord-1',
      idempotencyKey: 'idem-001',
      investorId: 'inv-001',
      productId: 'USTBL',
      kind: 'subscribe',
      status: 'PENDING',
      usdcAmountMinor: 1_000_000_000n,
      sharesMinor: 995_000_000n,
      navScaled: 10_000_000n,
      collectTxHash: null,
      mintTxHash: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });

    const found = repo.findByIdempotencyKey('idem-001');
    if (!found.ok) throw found.error;
    expect(found.value).toEqual(reserved.value.order);
  });

  it('returns the original order when the idempotency key is replayed', () => {
    const { repo } = setup();

    const first = repo.reserve(ORDER);
    const second = repo.reserve(ORDER);
    if (!first.ok) throw first.error;
    if (!second.ok) throw second.error;

    expect(second.value.created).toBe(false);
    expect(second.value.order).toEqual(first.value.order);

    const count = repo.findByIdempotencyKey('idem-001');
    if (!count.ok) throw count.error;
    expect(count.value?.id).toBe(first.value.order.id);
  });

  it('rejects an idempotency key reused for different order details', () => {
    const { repo } = setup();

    const first = repo.reserve(ORDER);
    if (!first.ok) throw first.error;

    const conflicting = repo.reserve({
      ...ORDER,
      usdcAmountMinor: parseUnits('101'),
    });
    if (conflicting.ok) throw new Error('expected idempotency conflict');
    expect(conflicting.error.code).toBe('CONFLICT');
  });

  it('advances status through the state machine and records tx hashes', () => {
    const { repo } = setup();

    const reserved = repo.reserve(ORDER);
    if (!reserved.ok) throw reserved.error;
    const id = reserved.value.order.id;

    const collecting = repo.updateStatus(id, 'COLLECTING', {
      collectTxHash: 'collect-hash',
    });
    if (!collecting.ok) throw collecting.error;
    expect(collecting.value.status).toBe('COLLECTING');
    expect(collecting.value.collectTxHash).toBe('collect-hash');

    const minting = repo.updateStatus(id, 'MINTING', {
      mintTxHash: 'mint-hash',
    });
    if (!minting.ok) throw minting.error;
    expect(minting.value.status).toBe('MINTING');
    expect(minting.value.collectTxHash).toBe('collect-hash');
    expect(minting.value.mintTxHash).toBe('mint-hash');

    const settled = repo.updateStatus(id, 'SETTLED');
    if (!settled.ok) throw settled.error;
    expect(settled.value.status).toBe('SETTLED');
  });

  it('rejects illegal transitions and unknown order ids', () => {
    const { repo } = setup();

    const reserved = repo.reserve(ORDER);
    if (!reserved.ok) throw reserved.error;

    const illegal = repo.updateStatus(reserved.value.order.id, 'SETTLED');
    if (illegal.ok) throw new Error('expected illegal transition to fail');
    expect(illegal.error.code).toBe('CONFLICT');

    const missing = repo.updateStatus('ord-missing', 'COLLECTING');
    if (missing.ok) throw new Error('expected missing order to fail');
    expect(missing.error.code).toBe('NOT_FOUND');
  });

  it('rejects a blank transaction hash', () => {
    const { repo } = setup();

    const reserved = repo.reserve(ORDER);
    if (!reserved.ok) throw reserved.error;

    const result = repo.updateStatus(reserved.value.order.id, 'COLLECTING', {
      collectTxHash: ' ',
    });
    if (result.ok) throw new Error('expected blank hash to fail');
    expect(result.error.code).toBe('VALIDATION');
  });
});
