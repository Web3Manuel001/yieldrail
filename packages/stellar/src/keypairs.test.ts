import { type AppError, type Result } from '@yieldrail/core';
import { describe, expect, it } from 'vitest';

import {
  generateKeypair,
  isValidPublicKey,
  keypairFromSecret,
  type GeneratedKeypair,
} from './keypairs';

function unwrap<T>(result: Result<T, AppError>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

describe('keypairs', () => {
  it('generates distinct valid Stellar keypairs', () => {
    const first: GeneratedKeypair = unwrap(generateKeypair());
    const second = unwrap(generateKeypair());

    expect(first.publicKey).toMatch(/^G[A-Z2-7]{55}$/);
    expect(first.secret).toMatch(/^S[A-Z2-7]{55}$/);
    expect(isValidPublicKey(first.publicKey)).toBe(true);
    expect(first.publicKey).not.toBe(second.publicKey);

    const restored = unwrap(keypairFromSecret(first.secret));
    expect(restored.publicKey()).toBe(first.publicKey);
  });

  it('rejects invalid addresses and secret seeds', () => {
    expect(isValidPublicKey('')).toBe(false);
    expect(isValidPublicKey('GNOTAVALIDSTELLARADDRESS')).toBe(false);
    expect(isValidPublicKey('not-an-address')).toBe(false);

    const result = keypairFromSecret('SINVALID');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected invalid secret to fail');
    expect(result.error.code).toBe('VALIDATION');
  });
});
