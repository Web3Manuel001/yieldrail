import {
  Account,
  Asset,
  AuthClawbackEnabledFlag,
  AuthRequiredFlag,
  AuthRevocableFlag,
  BASE_FEE,
  Keypair,
  Operation,
  TransactionBuilder,
  type AuthFlag,
} from '@stellar/stellar-sdk';
import { AppError, err, ok, type Result } from '@yieldrail/core';

import type { HorizonGateway } from '../gateway';

/** USTBL issuer flags: required + revocable + clawback enabled. */
export const ASSET_AUTH_FLAGS =
  AuthRequiredFlag | AuthRevocableFlag | AuthClawbackEnabledFlag;

export interface IssuerAccountFlags {
  auth_required: boolean;
  auth_revocable: boolean;
  auth_clawback_enabled: boolean;
}

/** True only when all three USTBL issuer flags are present. */
export function hasRequiredAuthFlags(flags: IssuerAccountFlags): boolean {
  return (
    flags.auth_required &&
    flags.auth_revocable &&
    flags.auth_clawback_enabled
  );
}

export interface IssueAssetInput {
  issuer: string;
  signer: Keypair;
  assetCode: string;
}

export interface IssueAssetResult {
  hash: string;
  assetCode: string;
  issuer: string;
  flags: number;
}

/**
 * Configure an asset issuer. Stellar has no "create asset" operation: the asset
 * exists once the issuer account sets its authorization flags and holders trust it.
 */
export async function issueAsset(
  gateway: HorizonGateway,
  networkPassphrase: string,
  input: IssueAssetInput,
): Promise<Result<IssueAssetResult, AppError>> {
  if (input.signer.publicKey() !== input.issuer) {
    return err(
      new AppError('VALIDATION', 'Issuer signer does not match issuer address'),
    );
  }

  try {
    // Constructing the Asset validates the code and issuer address.
    new Asset(input.assetCode, input.issuer);
  } catch (error) {
    return err(
      new AppError('VALIDATION', 'Invalid asset code or issuer', error),
    );
  }

  const flags = ASSET_AUTH_FLAGS;

  try {
    const source = await gateway.loadAccount(input.issuer);
    const account = new Account(input.issuer, source.sequenceNumber());
    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(
        Operation.setOptions({ setFlags: flags as AuthFlag }),
      )
      .setTimeout(30)
      .build();

    transaction.sign(input.signer);
    const response = await gateway.submitTransaction(transaction);

    return ok({
      hash: response.hash,
      assetCode: input.assetCode,
      issuer: input.issuer,
      flags,
    });
  } catch (error) {
    return err(
      new AppError('CHAIN', 'Failed to configure asset issuer flags', error),
    );
  }
}
