import { AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';

export interface Investor {
  readonly id: string;
  readonly walletAddress: string;
  /**
   * ISO 3166-1 alpha-2 country code. Kept as a string here: the eligibility
   * passport enforces the supported-jurisdiction allowlist.
   */
  readonly jurisdiction: string;
}

export interface CreateInvestorInput {
  id: string;
  walletAddress: string;
  jurisdiction: string;
}

/** Build a validated investor entity. Pure: no I/O, no chain calls. */
export function createInvestor(
  input: CreateInvestorInput,
): Result<Investor, AppError> {
  const id = input.id.trim();
  if (id === '') {
    return err(new AppError('VALIDATION', 'Investor id is required'));
  }

  const walletAddress = input.walletAddress.trim();
  if (walletAddress === '') {
    return err(new AppError('VALIDATION', 'Investor wallet address is required'));
  }

  const jurisdiction = input.jurisdiction.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(jurisdiction)) {
    return err(
      new AppError('VALIDATION', 'Investor jurisdiction must be a 2-letter country code'),
    );
  }

  return ok(Object.freeze({ id, walletAddress, jurisdiction }));
}
