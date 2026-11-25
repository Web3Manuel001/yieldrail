import {
  formatUnits,
  stroops,
  type Eligibility,
} from '@yieldrail/core';
import {
  generateKeypair,
  type AccountBalance,
  type GeneratedKeypair,
  type HorizonGateway,
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

export function keypair(): GeneratedKeypair {
  const generated = generateKeypair();
  if (!generated.ok) throw generated.error;
  return generated.value;
}

export function createHarness(options: HarnessOptions = {}): Harness {
  const { failSubmit, ...containerOptions } = options;
  const issuer = keypair();
  const investor = keypair();
  const eventBus = new InMemoryEventBus();
  const submitted: SubmittedTx[] = [];
  const balances = new Map<string, Map<string, bigint>>();

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
      return { hash: `tx-${submitted.length}` };
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
  };
}

export function postOnboard(harness: Harness, body: OnboardBody) {
  return harness.app.inject({
    method: 'POST',
    url: '/v1/investors',
    payload: body,
  });
}
