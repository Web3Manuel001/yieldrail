import {
  AppError,
  OnboardInvestor,
  SubscribeOrder,
  err,
  ok,
  type ClockPort,
  type EventBusPort,
  type InvestorLookupPort,
  type InvestorRepositoryPort,
  type KycPort,
  type LedgerPort,
  type NavPort,
  type OrderRepositoryPort,
  type PolicyPort,
  type Result,
} from '@yieldrail/core';
import { createMockKycAdapter } from '@yieldrail/kyc-mock';
import { createMockNavAdapter } from '@yieldrail/nav-mock';
import {
  SqliteInvestorRepository,
  SqliteLedgerAdapter,
  SqliteOrderRepository,
  openMigratedDatabase,
} from '@yieldrail/persistence';
import {
  HorizonServerGateway,
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
  readonly investorRepository?: InvestorRepositoryPort & InvestorLookupPort;
  readonly orderRepository?: OrderRepositoryPort;
  readonly navPort?: NavPort;
  readonly ledgerPort?: LedgerPort;
}

export interface ApiContainer {
  readonly onboardInvestor: OnboardInvestor;
  readonly subscribeOrder: SubscribeOrder;
  readonly investors: InvestorRepositoryPort;
  readonly orderRepository: OrderRepositoryPort;
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

  const investorPublic = env.INVESTOR_PUBLIC_KEY;
  const investorSecret = env.INVESTOR_SECRET;
  let investorSigner: ReturnType<typeof keypairFromSecret> | undefined;
  if (
    (investorPublic === undefined || investorPublic === '') !==
    (investorSecret === undefined || investorSecret === '')
  ) {
    return fail(
      new AppError(
        'VALIDATION',
        'INVESTOR_PUBLIC_KEY and INVESTOR_SECRET must be provided together',
      ),
    );
  }
  if (investorSecret !== undefined && investorSecret !== '') {
    investorSigner = keypairFromSecret(investorSecret);
    if (!investorSigner.ok) return fail(investorSigner.error);
    if (investorSigner.value.publicKey() !== investorPublic) {
      return fail(
        new AppError(
          'VALIDATION',
          'INVESTOR_SECRET does not match INVESTOR_PUBLIC_KEY',
        ),
      );
    }
  }

  const client = createTestnetClient(env.HORIZON_URL ?? TESTNET_HORIZON_URL);
  if (!client.ok) return fail(client.error);

  const usdcIssuer =
    env.USDC_ISSUER === undefined || env.USDC_ISSUER === ''
      ? issuer
      : env.USDC_ISSUER;

  const signers =
    investorSigner !== undefined && investorSigner.ok
      ? { [investorSigner.value.publicKey()]: investorSigner.value }
      : undefined;

  const investors =
    options.investorRepository ?? new SqliteInvestorRepository(db);
  const orders = options.orderRepository ?? new SqliteOrderRepository(db);
  const eventBus = options.eventBus ?? new InMemoryEventBus();
  const clock = options.clock ?? systemClock;
  const chain = new StellarChainAdapter({
    gateway: options.gateway ?? new HorizonServerGateway(client.value.server),
    networkPassphrase: client.value.networkPassphrase,
    issuer,
    signer: signer.value,
    assetIssuers: { USDC: usdcIssuer },
    ...(signers === undefined ? {} : { signers }),
  });

  return ok({
    onboardInvestor: new OnboardInvestor({
      policy: options.policyPort ?? createFixturePolicyPort(),
      kyc: options.kycPort ?? createMockKycAdapter(),
      chain,
      investors,
      events: eventBus,
      clock,
    }),
    subscribeOrder: new SubscribeOrder({
      orders,
      investors,
      investorLookup: investors,
      nav: options.navPort ?? createMockNavAdapter(),
      chain,
      ledger: options.ledgerPort ?? new SqliteLedgerAdapter(db),
      events: eventBus,
      clock,
      issuerAddress: issuer,
    }),
    investors,
    orderRepository: orders,
    eventBus,
    close: () => db.close(),
  });
}
