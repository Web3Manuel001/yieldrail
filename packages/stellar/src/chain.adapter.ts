import {
  AppError,
  err,
  ok,
  type ChainPayment,
  type ChainPort,
  type Result,
  type Stroops,
} from '@yieldrail/core';
import type { Keypair } from '@stellar/stellar-sdk';

import type { HorizonGateway } from './gateway';
import { authorizeTrustline } from './operations/authorize-trustline';
import { getBalance as getBalanceOperation } from './operations/get-balance';
import { submitPayment as submitPaymentOperation } from './operations/submit-payment';

export interface StellarChainAdapterConfig {
  gateway: HorizonGateway;
  networkPassphrase: string;
  issuer: string;
  signer: Keypair;
  /** Optional per-asset issuer overrides (for example mock USDC). */
  assetIssuers?: Readonly<Record<string, string>>;
  /** Optional per-source payment signers (for example the investor account). */
  signers?: Readonly<Record<string, Keypair>>;
}

/**
 * ChainPort adapter. Trustline authorization, payments, and balances are
 * implemented; clawback and streaming land in later tasks.
 */
export class StellarChainAdapter implements ChainPort {
  constructor(private readonly config: StellarChainAdapterConfig) {}

  async authorizeTrustline(
    investor: string,
    asset: string,
  ): Promise<Result<string, AppError>> {
    const result = await authorizeTrustline(
      this.config.gateway,
      this.config.networkPassphrase,
      {
        issuer: this.config.issuer,
        signer: this.config.signer,
        investor,
        assetCode: asset,
      },
    );

    if (!result.ok) return result;
    return ok(result.value.hash);
  }

  async submitPayment(
    from: string,
    to: string,
    asset: string,
    amount: Stroops,
  ): Promise<Result<string, AppError>> {
    const signer = this.paymentSigner(from);
    if (signer === undefined) {
      return err(
        new AppError('VALIDATION', `No signer configured for payment source ${from}`),
      );
    }

    const result = await submitPaymentOperation(
      this.config.gateway,
      this.config.networkPassphrase,
      {
        source: from,
        signer,
        destination: to,
        assetCode: asset,
        assetIssuer: this.assetIssuer(asset),
        amount,
      },
    );

    if (!result.ok) return result;
    return ok(result.value.hash);
  }

  async clawback(
    _from: string,
    _asset: string,
    _amount: Stroops,
  ): Promise<Result<string, AppError>> {
    return err(new AppError('INTERNAL', 'clawback is not implemented yet'));
  }

  async getBalance(
    account: string,
    asset: string,
  ): Promise<Result<Stroops, AppError>> {
    return getBalanceOperation(this.config.gateway, {
      account,
      assetCode: asset,
      assetIssuer: this.assetIssuer(asset),
    });
  }

  streamPayments(_handler: (payment: ChainPayment) => void): { stop(): void } {
    return { stop: () => undefined };
  }

  private assetIssuer(asset: string): string {
    return this.config.assetIssuers?.[asset] ?? this.config.issuer;
  }

  private paymentSigner(source: string): Keypair | undefined {
    const configured = this.config.signers?.[source];
    if (configured !== undefined) return configured;
    return this.config.signer.publicKey() === source
      ? this.config.signer
      : undefined;
  }
}
