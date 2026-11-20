import { Horizon, Networks } from '@stellar/stellar-sdk';
import { AppError, err, ok, type Result } from '@yieldrail/core';

export const TESTNET_HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const TESTNET_NETWORK_PASSPHRASE: string = Networks.TESTNET;

export interface TestnetClient {
  readonly server: Horizon.Server;
  readonly horizonUrl: string;
  readonly networkPassphrase: string;
}

function isTestnetHorizonUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

    const host = url.hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.includes('testnet')
    );
  } catch {
    return false;
  }
}

/**
 * Build a Horizon client pinned to Stellar testnet. Mainnet URLs are rejected.
 */
export function createTestnetClient(
  horizonUrl: string = TESTNET_HORIZON_URL,
): Result<TestnetClient, AppError> {
  if (!isTestnetHorizonUrl(horizonUrl)) {
    return err(
      new AppError('VALIDATION', 'Only Stellar testnet Horizon URLs are allowed'),
    );
  }

  try {
    return ok({
      server: new Horizon.Server(horizonUrl),
      horizonUrl,
      networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
    });
  } catch (error) {
    return err(
      new AppError('CHAIN', 'Failed to create Horizon testnet client', error),
    );
  }
}
