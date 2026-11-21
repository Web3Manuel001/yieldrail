import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { AppError, err, ok, type Result } from '@yieldrail/core';

import type { HorizonGateway } from '../gateway';
import { isValidPublicKey } from '../keypairs';

export interface AuthorizeTrustlineInput {
  /** The asset issuer; also the transaction source and signer. */
  issuer: string;
  signer: Keypair;
  investor: string;
  assetCode: string;
}

export interface AuthorizeTrustlineResult {
  hash: string;
  investor: string;
  assetCode: string;
  issuer: string;
  authorized: true;
}

/**
 * Authorize an investor's trustline for the issuer's asset. The issuer must
 * have AUTH_REQUIRED set; the investor has already submitted changeTrust.
 */
export async function authorizeTrustline(
  gateway: HorizonGateway,
  networkPassphrase: string,
  input: AuthorizeTrustlineInput,
): Promise<Result<AuthorizeTrustlineResult, AppError>> {
  if (input.signer.publicKey() !== input.issuer) {
    return err(
      new AppError('VALIDATION', 'Signer does not match the issuer address'),
    );
  }

  if (!isValidPublicKey(input.investor)) {
    return err(new AppError('VALIDATION', 'Invalid investor address'));
  }

  try {
    // Constructing the Asset validates both the code and the issuer address.
    new Asset(input.assetCode, input.issuer);
  } catch (error) {
    return err(
      new AppError('VALIDATION', 'Invalid asset code or issuer', error),
    );
  }

  try {
    const source = await gateway.loadAccount(input.issuer);
    const account = new Account(input.issuer, source.sequenceNumber());
    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(
        Operation.allowTrust({
          trustor: input.investor,
          assetCode: input.assetCode,
          authorize: true,
        }),
      )
      .setTimeout(30)
      .build();

    transaction.sign(input.signer);
    const response = await gateway.submitTransaction(transaction);

    return ok({
      hash: response.hash,
      investor: input.investor,
      assetCode: input.assetCode,
      issuer: input.issuer,
      authorized: true,
    });
  } catch (error) {
    return err(
      new AppError('CHAIN', 'Failed to authorize investor trustline', error),
    );
  }
}
