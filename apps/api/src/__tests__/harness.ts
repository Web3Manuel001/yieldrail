import type { Eligibility } from '@yieldrail/core';
import {
  generateKeypair,
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
type SubmittedTx = Parameters<HorizonGateway['submitTransaction']>[0];

export interface Harness {
  app: FastifyInstance;
  container: ApiContainer;
  eventBus: InMemoryEventBus;
  submitted: SubmittedTx[];
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

export function createHarness(
  options: Partial<ContainerOptions> = {},
): Harness {
  const issuer = keypair();
  const eventBus = new InMemoryEventBus();
  const submitted: SubmittedTx[] = [];

  const gateway: HorizonGateway = {
    loadAccount: async () => ({ sequenceNumber: () => '123456789' }),
    submitTransaction: async (transaction) => {
      submitted.push(transaction);
      return { hash: `tx-${submitted.length}` };
    },
  };

  const created = createContainer({
    databasePath: ':memory:',
    gateway,
    eventBus,
    clock: { now: () => NOW },
    env: {
      ISSUER_PUBLIC_KEY: issuer.publicKey,
      ISSUER_SECRET: issuer.secret,
      HORIZON_URL: 'https://horizon-testnet.stellar.org',
      USTBL_ASSET_CODE: 'USTBL',
    },
    ...options,
  });
  if (!created.ok) throw created.error;

  return {
    app: buildApp(created.value, { logger: false }),
    container: created.value,
    eventBus,
    submitted,
  };
}

export function postOnboard(harness: Harness, body: OnboardBody) {
  return harness.app.inject({
    method: 'POST',
    url: '/v1/investors',
    payload: body,
  });
}
