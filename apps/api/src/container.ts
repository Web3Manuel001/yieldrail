import {
  AppError,
  OnboardInvestor,
  err,
  ok,
  type ClockPort,
  type EventBusPort,
  type InvestorRepositoryPort,
  type KycPort,
  type PolicyPort,
  type Result,
} from '@yieldrail/core';
import { createMockKycAdapter } from '@yieldrail/kyc-mock';
import {
  SqliteInvestorRepository,
  openMigratedDatabase,
} from '@yieldrail/persistence';
import {
  StellarChainAdapter,
  TESTNET_HORIZON_URL,
  createTestnetClient,
  keypairFromSecret,
  type HorizonGateway,
} from '@yieldrail/stellar';

import { createFixturePolicyPort } from './fixture-policy.adapter';
import { InMemoryEventBus } from './in-memory-event-bus';
import { systemClock } from './system-clock';

export interface ContainerOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly databasePath?: string;
  readonly gateway?: HorizonGateway;
  readonly clock?: ClockPort;
  readonly policyPort?: PolicyPort;
  readonly kycPort?: KycPort;
  readonly eventBus?: EventBusPort;
  readonly investorRepository?: InvestorRepositoryPort;
}

export interface ApiContainer {
  readonly onboardInvestor: OnboardInvestor;
  readonly investors: InvestorRepositoryPort;
  readonly eventBus: EventBusPort;
  close(): void;
}

/**
 * The only composition root: wires persistence, Stellar, mock KYC, clock,
 * fixture policy, and event bus into the onboarding use-case.
 */
export function createContainer(
  options: ContainerOptions = {},
): Result<ApiContainer, AppError> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...options.env,
  };

  const database = openMigratedDatabase({
    filename: options.databasePath ?? env.DATABASE_PATH ?? './yieldrail.sqlite',
  });
  if (!database.ok) return database;
  const db = database.value;

  const fail = (error: AppError): Result<ApiContainer, AppError> => {
    db.close();
    return err(error);
  };

  const issuer = env.ISSUER_PUBLIC_KEY;
  const issuerSecret = env.ISSUER_SECRET;
  if (issuer === undefined || issuer === '' || issuerSecret === undefined || issuerSecret === '') {
    return fail(
      new AppError(
        'VALIDATION',
        'ISSUER_PUBLIC_KEY and ISSUER_SECRET are required',
      ),
    );
  }

  const signer = keypairFromSecret(issuerSecret);
  if (!signer.ok) return fail(signer.error);
  if (signer.value.publicKey() !== issuer) {
    return fail(
      new AppError('VALIDATION', 'ISSUER_SECRET does not match ISSUER_PUBLIC_KEY'),
    );
  }

  const client = createTestnetClient(env.HORIZON_URL ?? TESTNET_HORIZON_URL);
  if (!client.ok) return fail(client.error);

  const investors =
    options.investorRepository ?? new SqliteInvestorRepository(db);
  const eventBus = options.eventBus ?? new InMemoryEventBus();
  const chain = new StellarChainAdapter({
    gateway: options.gateway ?? client.value.server,
    networkPassphrase: client.value.networkPassphrase,
    issuer,
    signer: signer.value,
  });

  return ok({
    onboardInvestor: new OnboardInvestor({
      policy: options.policyPort ?? createFixturePolicyPort(),
      kyc: options.kycPort ?? createMockKycAdapter(),
      chain,
      investors,
      events: eventBus,
      clock: options.clock ?? systemClock,
    }),
    investors,
    eventBus,
    close: () => db.close(),
  });
}
