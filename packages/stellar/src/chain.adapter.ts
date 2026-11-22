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

export interface StellarChainAdapterConfig {
  gateway: HorizonGateway;
  networkPassphrase: string;
  issuer: string;
  signer: Keypair;
}

/**
 * ChainPort adapter for the onboarding slice. Payment, clawback, balance, and
 * streaming are intentionally not implemented until their tasks land.
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
    _from: string,
    _to: string,
    _asset: string,
    _amount: Stroops,
  ): Promise<Result<string, AppError>> {
    return err(
      new AppError('INTERNAL', 'submitPayment is not implemented yet'),
    );
  }

  async clawback(
    _from: string,
    _asset: string,
    _amount: Stroops,
  ): Promise<Result<string, AppError>> {
    return err(new AppError('INTERNAL', 'clawback is not implemented yet'));
  }

  async getBalance(
    _account: string,
    _asset: string,
  ): Promise<Result<Stroops, AppError>> {
    return err(new AppError('INTERNAL', 'getBalance is not implemented yet'));
  }

  streamPayments(_handler: (payment: ChainPayment) => void): { stop(): void } {
    return { stop: () => undefined };
  }
}
