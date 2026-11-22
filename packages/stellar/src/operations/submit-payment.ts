import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  AppError,
  err,
  formatUnits,
  ok,
  type Result,
  type Stroops,
} from '@yieldrail/core';

import type { HorizonGateway } from '../gateway';
import { isValidPublicKey } from '../keypairs';

export interface SubmitPaymentInput {
  /** Payment source; the transaction is signed by this account. */
  source: string;
  signer: Keypair;
  destination: string;
  assetCode: string;
  assetIssuer: string;
  amount: Stroops;
}

export interface SubmitPaymentResult {
  readonly hash: string;
  readonly source: string;
  readonly destination: string;
  readonly assetCode: string;
  readonly amount: Stroops;
}

/**
 * Submit a payment signed by its source account. Amounts are integer Stroops
 * and converted to Stellar's decimal wire format only at the SDK boundary.
 */
export async function submitPayment(
  gateway: HorizonGateway,
  networkPassphrase: string,
  input: SubmitPaymentInput,
): Promise<Result<SubmitPaymentResult, AppError>> {
  if (input.signer.publicKey() !== input.source) {
    return err(
      new AppError('VALIDATION', 'Payment signer does not match the source'),
    );
  }

  if (!isValidPublicKey(input.destination)) {
    return err(new AppError('VALIDATION', 'Invalid payment destination'));
  }

  if (input.amount <= 0n) {
    return err(new AppError('VALIDATION', 'Payment amount must be positive'));
  }

  let asset: Asset;
  try {
    // Constructing the Asset validates both the code and the issuer address.
    asset = new Asset(input.assetCode, input.assetIssuer);
  } catch (error) {
    return err(
      new AppError('VALIDATION', 'Invalid asset code or issuer', error),
    );
  }

  try {
    const source = await gateway.loadAccount(input.source);
    const transaction = new TransactionBuilder(
      new Account(input.source, source.sequenceNumber()),
      { fee: BASE_FEE, networkPassphrase },
    )
      .addOperation(
        Operation.payment({
          destination: input.destination,
          asset,
          amount: formatUnits(input.amount),
        }),
      )
      .setTimeout(30)
      .build();

    transaction.sign(input.signer);
    const response = await gateway.submitTransaction(transaction);

    return ok({
      hash: response.hash,
      source: input.source,
      destination: input.destination,
      assetCode: input.assetCode,
      amount: input.amount,
    });
  } catch (error) {
    return err(new AppError('CHAIN', 'Failed to submit payment', error));
  }
}
