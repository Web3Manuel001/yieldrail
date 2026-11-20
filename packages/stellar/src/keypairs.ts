import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { AppError, err, ok, type Result } from '@yieldrail/core';

export interface GeneratedKeypair {
  readonly publicKey: string;
  readonly secret: string;
}

/** Generate a fresh Ed25519 keypair. Secrets are returned for .env storage only. */
export function generateKeypair(): Result<GeneratedKeypair, AppError> {
  try {
    const keypair = Keypair.random();
    return ok({
      publicKey: keypair.publicKey(),
      secret: keypair.secret(),
    });
  } catch (error) {
    return err(
      new AppError('CHAIN', 'Failed to generate a Stellar keypair', error),
    );
  }
}

/** Validate a Stellar public address without throwing. */
export function isValidPublicKey(address: string): boolean {
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}

/** Load a keypair from a secret seed, converting invalid input to Result. */
export function keypairFromSecret(
  secret: string,
): Result<Keypair, AppError> {
  try {
    if (!StrKey.isValidEd25519SecretSeed(secret)) {
      return err(new AppError('VALIDATION', 'Invalid Stellar secret seed'));
    }
    return ok(Keypair.fromSecret(secret));
  } catch (error) {
    return err(new AppError('VALIDATION', 'Invalid Stellar secret seed', error));
  }
}
