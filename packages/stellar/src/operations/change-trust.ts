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

export interface ChangeTrustInput {
  holder: string;
  signer: Keypair;
  assetCode: string;
  issuer: string;
}

export interface ChangeTrustResult {
  hash: string;
  assetCode: string;
  issuer: string;
}

/** Establish an investor trustline for an asset. The issuer still must authorize it. */
export async function changeTrust(
  gateway: HorizonGateway,
  networkPassphrase: string,
  input: ChangeTrustInput,
): Promise<Result<ChangeTrustResult, AppError>> {
  if (input.signer.publicKey() !== input.holder) {
    return err(
      new AppError('VALIDATION', 'Holder signer does not match holder address'),
    );
  }

  let asset: Asset;
  try {
    // Constructing the Asset validates the code and issuer address.
    asset = new Asset(input.assetCode, input.issuer);
  } catch (error) {
    return err(
      new AppError('VALIDATION', 'Invalid asset code or issuer', error),
    );
  }

  try {
    const source = await gateway.loadAccount(input.holder);
    const account = new Account(input.holder, source.sequenceNumber());
    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(Operation.changeTrust({ asset }))
      .setTimeout(30)
      .build();

    transaction.sign(input.signer);
    const response = await gateway.submitTransaction(transaction);

    return ok({
      hash: response.hash,
      assetCode: input.assetCode,
      issuer: input.issuer,
    });
  } catch (error) {
    return err(
      new AppError('CHAIN', 'Failed to establish trustline', error),
    );
  }
}
