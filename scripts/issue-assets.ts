import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  ASSET_AUTH_FLAGS,
  TESTNET_HORIZON_URL,
  changeTrust,
  createTestnetClient,
  issueAsset,
  keypairFromSecret,
} from '@yieldrail/stellar';

import { parseEnv, readText } from './env-file';

const DEFAULT_ASSET_CODE = 'USTBL';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));

function log(correlationId: string, event: Record<string, unknown>): void {
  console.log(JSON.stringify({ correlationId, ...event }));
}

function logError(correlationId: string, error: unknown): void {
  console.error(
    JSON.stringify({
      correlationId,
      level: 'error',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
}

function requireEnv(
  env: Record<string, string | undefined>,
  key: string,
): string {
  const value = env[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

async function main(): Promise<void> {
  const correlationId = randomUUID();

  try {
    const fileEnv = parseEnv(readText(envPath));
    const env: Record<string, string | undefined> = {
      ...fileEnv,
      ...process.env,
    };

    const clientResult = createTestnetClient(
      env.HORIZON_URL ?? TESTNET_HORIZON_URL,
    );
    if (!clientResult.ok) throw clientResult.error;
    const client = clientResult.value;

    const issuerPublicKey = requireEnv(env, 'ISSUER_PUBLIC_KEY');
    const issuerSecret = requireEnv(env, 'ISSUER_SECRET');
    const investorPublicKey = requireEnv(env, 'INVESTOR_PUBLIC_KEY');
    const investorSecret = requireEnv(env, 'INVESTOR_SECRET');
    const assetCode = env.USTBL_ASSET_CODE ?? DEFAULT_ASSET_CODE;

    const issuerKeypair = keypairFromSecret(issuerSecret);
    if (!issuerKeypair.ok) throw issuerKeypair.error;
    if (issuerKeypair.value.publicKey() !== issuerPublicKey) {
      throw new Error('ISSUER_SECRET does not match ISSUER_PUBLIC_KEY');
    }

    const investorKeypair = keypairFromSecret(investorSecret);
    if (!investorKeypair.ok) throw investorKeypair.error;
    if (investorKeypair.value.publicKey() !== investorPublicKey) {
      throw new Error('INVESTOR_SECRET does not match INVESTOR_PUBLIC_KEY');
    }

    // Stellar has no mint-on-create: the asset exists once the issuer sets its
    // authorization flags and a holder establishes a trustline.
    const issued = await issueAsset(client.server, client.networkPassphrase, {
      issuer: issuerPublicKey,
      signer: issuerKeypair.value,
      assetCode,
    });
    if (!issued.ok) throw issued.error;

    log(correlationId, {
      level: 'info',
      event: 'issue-assets.flags-set',
      hash: issued.value.hash,
      assetCode,
      issuer: issuerPublicKey,
      flags: issued.value.flags,
      expectedFlags: ASSET_AUTH_FLAGS,
    });

    const trusted = await changeTrust(client.server, client.networkPassphrase, {
      holder: investorPublicKey,
      signer: investorKeypair.value,
      assetCode,
      issuer: issuerPublicKey,
    });
    if (!trusted.ok) throw trusted.error;

    log(correlationId, {
      level: 'info',
      event: 'issue-assets.trustline-created',
      hash: trusted.value.hash,
      assetCode,
      issuer: issuerPublicKey,
      holder: investorPublicKey,
    });

    log(correlationId, { level: 'info', event: 'issue-assets.complete' });
  } catch (error) {
    logError(correlationId, error);
    process.exitCode = 1;
  }
}

await main();
