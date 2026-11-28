import {
  formatUnits,
  stroops,
  type Eligibility,
} from '@yieldrail/core';
import {
  generateKeypair,
  memoValueForHorizon,
  type AccountBalance,
  type GeneratedKeypair,
  type HorizonGateway,
  type HorizonMemoFields,
  type HorizonTransactionRecord,
} from '@yieldrail/stellar';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app';
import {
  createContainer,
  type ApiContainer,
  type ContainerOptions,
} from '../container';
import { InMemoryEventBus } from '../in-memory-event-bus';

export const NOW = new Date('2026-11-22T09:00:00.000Z');
export type SubmittedTx = Parameters<HorizonGateway['submitTransaction']>[0];

export interface SeedTransactionInput {
  readonly hash: string;
  readonly source: string;
  readonly memo?: string;
  readonly successful?: boolean;
  /** Seed a record with no outcome, which the status lookup reports as pending. */
  readonly pending?: boolean;
}

export interface HarnessOptions extends Partial<ContainerOptions> {
  /** Fail a submitted transaction at this 1-based index (Horizon rejection). */
  readonly failSubmit?: (transaction: SubmittedTx, index: number) => boolean;
}

export interface Harness {
  app: FastifyInstance;
  container: ApiContainer;
  eventBus: InMemoryEventBus;
  submitted: SubmittedTx[];
  issuer: GeneratedKeypair;
  investor: GeneratedKeypair;
  setBalance(account: string, asset: string, amount: bigint): void;
  /** Record a chain transaction without submitting it (crash simulation). */
  seedTransaction(input: SeedTransactionInput): void;
}

export interface OnboardBody {
  investorId: string;
  wallet: string;
  jurisdiction: string;
  productId: string;
}

export interface OnboardResponse {
  eligibility: Eligibility;
  authorizationTxHash: string;
}

interface ChainRecord extends HorizonTransactionRecord {
  readonly source_account: string;
}

export function keypair(): GeneratedKeypair {
  const generated = generateKeypair();
  if (!generated.ok) throw generated.error;
  return generated.value;
}

function memoFields(
  transaction: SubmittedTx,
): HorizonMemoFields | { memo_type: 'none' } {
  const memo = transaction.memo;
  if (memo.type === 'none') return { memo_type: 'none' };
  if (memo.type === 'hash' || memo.type === 'return') {
    return {
      memo_type: memo.type,
      memo: Buffer.from(memo.value as Buffer).toString('base64'),
    };
  }
  return { memo_type: memo.type, memo: String(memo.value) };
}

function notFound(hash: string): Error {
  const error = new Error(`transaction not found: ${hash}`) as Error & {
    response: { status: number };
  };
  error.response = { status: 404 };
  return error;
}

export function createHarness(options: HarnessOptions = {}): Harness {
  const { failSubmit, ...containerOptions } = options;
  const issuer = keypair();
  const investor = keypair();
  const eventBus = new InMemoryEventBus();
  const submitted: SubmittedTx[] = [];
  const balances = new Map<string, Map<string, bigint>>();
  const chainRecords: ChainRecord[] = [];

  const gateway: HorizonGateway = {
    loadAccount: async (publicKey) => {
      const held = balances.get(publicKey);
      const lines: AccountBalance[] =
        held === undefined
          ? []
          : [...held.entries()].map(([assetCode, amount]) => ({
              asset_type: 'credit_alphanum4',
              asset_code: assetCode,
              asset_issuer: issuer.publicKey,
              balance: formatUnits(stroops(amount)),
            }));

      return { sequenceNumber: () => '123456789', balances: lines };
    },
    submitTransaction: async (transaction) => {
      submitted.push(transaction);
      if (failSubmit?.(transaction, submitted.length) === true) {
        throw new Error('horizon rejected the transaction');
      }

      const hash = `tx-${submitted.length}`;
      chainRecords.push({
        hash,
        successful: true,
        source_account: transaction.source,
        ...memoFields(transaction),
      });
      return { hash };
    },
    getTransaction: async (hash) => {
      const record = chainRecords.find((candidate) => candidate.hash === hash);
      if (record === undefined) throw notFound(hash);
      return record;
    },
    getAccountTransactions: async (account, query) => {
      const matching = chainRecords.filter(
        (record) => record.source_account === account,
      );
      const ordered =
        query?.order === 'asc' ? matching : [...matching].reverse();
      const limit = query?.limit;
      return limit === undefined ? ordered : ordered.slice(0, limit);
    },
  };

  const created = createContainer({
    databasePath: ':memory:',
    ...containerOptions,
    gateway,
    eventBus,
    clock: { now: () => NOW },
    env: {
      ISSUER_PUBLIC_KEY: issuer.publicKey,
      ISSUER_SECRET: issuer.secret,
      INVESTOR_PUBLIC_KEY: investor.publicKey,
      INVESTOR_SECRET: investor.secret,
      USDC_ISSUER: issuer.publicKey,
      HORIZON_URL: 'https://horizon-testnet.stellar.org',
      USTBL_ASSET_CODE: 'USTBL',
      ...containerOptions.env,
    },
  });
  if (!created.ok) throw created.error;

  return {
    app: buildApp(created.value, { logger: false }),
    container: created.value,
    eventBus,
    submitted,
    issuer,
    investor,
    setBalance(account, asset, amount) {
      const held = balances.get(account) ?? new Map<string, bigint>();
      held.set(asset, amount);
      balances.set(account, held);
    },
    seedTransaction(input) {
      const fields =
        input.memo === undefined
          ? { memo_type: 'none' }
          : memoValueForHorizon(input.memo);
      const outcome =
        input.pending === true ? {} : { successful: input.successful ?? true };
      chainRecords.push({
        hash: input.hash,
        source_account: input.source,
        ...outcome,
        ...fields,
      });
    },
  };
}

export function postOnboard(harness: Harness, body: OnboardBody) {
  return harness.app.inject({
    method: 'POST',
    url: '/v1/investors',
    payload: body,
  });
}
