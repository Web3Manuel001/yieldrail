import {
  AppError,
  err,
  ok,
  parseUnits,
  stroops,
  type Result,
  type Stroops,
} from '@yieldrail/core';

import type { AccountBalance, HorizonGateway } from '../gateway';
import { isValidPublicKey } from '../keypairs';

export interface GetBalanceInput {
  account: string;
  assetCode: string;
  assetIssuer: string;
}

function matchesAsset(
  balance: AccountBalance,
  input: GetBalanceInput,
): boolean {
  return (
    balance.asset_code === input.assetCode &&
    balance.asset_issuer === input.assetIssuer
  );
}

/**
 * Read an account's balance for one asset from Horizon, in integer Stroops.
 * A missing trustline or zero balance returns 0n; transport failures are CHAIN.
 */
export async function getBalance(
  gateway: HorizonGateway,
  input: GetBalanceInput,
): Promise<Result<Stroops, AppError>> {
  if (!isValidPublicKey(input.account)) {
    return err(new AppError('VALIDATION', 'Invalid account address'));
  }
  if (!isValidPublicKey(input.assetIssuer)) {
    return err(new AppError('VALIDATION', 'Invalid asset issuer address'));
  }
  if (input.assetCode.trim() === '') {
    return err(new AppError('VALIDATION', 'Asset code is required'));
  }

  try {
    const snapshot = await gateway.loadAccount(input.account);
    const balances = snapshot.balances ?? [];
    const balance = balances.find((line) => matchesAsset(line, input));

    if (balance === undefined) return ok(stroops(0n));
    return ok(parseUnits(balance.balance));
  } catch (error) {
    return err(new AppError('CHAIN', 'Failed to read account balance', error));
  }
}
