import { AppError, err, ok, type Result } from '@yieldrail/core';

import type { TestnetClient } from './client';
import { isValidPublicKey } from './keypairs';

export const TESTNET_FRIENDBOT_URL = 'https://friendbot.stellar.org';

export type FundingStatus = 'funded' | 'already-funded';

interface ErrorWithResponse {
  response?: { status?: number };
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const response = (error as ErrorWithResponse).response;
  return typeof response === 'object' && response !== null && response.status === 404;
}

async function accountExists(
  client: TestnetClient,
  publicKey: string,
): Promise<Result<boolean, AppError>> {
  try {
    await client.server.loadAccount(publicKey);
    return ok(true);
  } catch (error) {
    if (isNotFound(error)) return ok(false);
    return err(
      new AppError('CHAIN', 'Failed to load account from Horizon', error),
    );
  }
}

/**
 * Ensure a testnet account is funded. Safe to re-run: an existing account is
 * skipped, and Friendbot's "already exists" response is treated as success.
 */
export async function ensureFunded(
  client: TestnetClient,
  publicKey: string,
  friendbotUrl: string = TESTNET_FRIENDBOT_URL,
): Promise<Result<FundingStatus, AppError>> {
  if (!isValidPublicKey(publicKey)) {
    return err(new AppError('VALIDATION', 'Invalid Stellar public key'));
  }

  const exists = await accountExists(client, publicKey);
  if (!exists.ok) return exists;
  if (exists.value) return ok('already-funded');

  try {
    const url = new URL(friendbotUrl);
    url.searchParams.set('addr', publicKey);

    const response = await fetch(url);
    const body = await response.text();

    if (response.ok) return ok('funded');
    if (/already|exists?/i.test(body)) return ok('already-funded');

    return err(
      new AppError(
        'CHAIN',
        `Friendbot funding failed with HTTP ${response.status}`,
        body,
      ),
    );
  } catch (error) {
    return err(new AppError('CHAIN', 'Friendbot request failed', error));
  }
}
