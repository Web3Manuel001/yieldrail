import {
  AppError,
  TIERS,
  err,
  ok,
  type Eligibility,
  type Investor,
  type InvestorLookupPort,
  type InvestorRepositoryPort,
  type Result,
  type StoredEligibility,
  type Tier,
} from '@yieldrail/core';

import { mapSqliteError, type Db } from './db';

interface InvestorRow {
  id: string;
  wallet_address: string;
  jurisdiction: string;
}

interface EligibilityRow {
  investor_id: string;
  product_id: string;
  wallet_address: string;
  jurisdiction: string;
  tier: string;
  eligible_at: string;
  authorization_tx_hash: string;
}

function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value);
}

function toStoredEligibility(row: EligibilityRow): StoredEligibility {
  if (!isTier(row.tier)) {
    throw new AppError('INTERNAL', `Unknown eligibility tier: ${row.tier}`);
  }

  const eligibility: Eligibility = Object.freeze({
    investorId: row.investor_id,
    productId: row.product_id,
    walletAddress: row.wallet_address,
    jurisdiction: row.jurisdiction,
    tier: row.tier,
    eligibleAt: row.eligible_at,
  });

  return { eligibility, authorizationTxHash: row.authorization_tx_hash };
}

/** SQLite implementation of the onboarding persistence port. */
export class SqliteInvestorRepository
  implements InvestorRepositoryPort, InvestorLookupPort
{
  constructor(private readonly db: Db) {}

  findById(investorId: string): Result<Investor | null, AppError> {
    try {
      const row = this.db
        .prepare(
          'SELECT id, wallet_address, jurisdiction FROM investors WHERE id = ?',
        )
        .get(investorId) as InvestorRow | undefined;

      if (row === undefined) return ok(null);
      return ok(
        Object.freeze({
          id: row.id,
          walletAddress: row.wallet_address,
          jurisdiction: row.jurisdiction,
        }),
      );
    } catch (error) {
      return err(mapSqliteError(error));
    }
  }

  findEligibility(
    investorId: string,
    productId: string,
  ): Result<StoredEligibility | null, AppError> {
    try {
      const row = this.db
        .prepare(
          `SELECT investor_id, product_id, wallet_address, jurisdiction,
                  tier, eligible_at, authorization_tx_hash
             FROM investor_eligibility
            WHERE investor_id = ? AND product_id = ?`,
        )
        .get(investorId, productId) as EligibilityRow | undefined;

      return ok(row === undefined ? null : toStoredEligibility(row));
    } catch (error) {
      return err(mapSqliteError(error));
    }
  }

  saveOnboarded(
    investor: Investor,
    eligibility: Eligibility,
    authorizationTxHash: string,
  ): Result<void, AppError> {
    if (
      eligibility.investorId !== investor.id ||
      eligibility.walletAddress !== investor.walletAddress ||
      eligibility.jurisdiction !== investor.jurisdiction
    ) {
      return err(
        new AppError('VALIDATION', 'Eligibility does not match the investor'),
      );
    }

    try {
      const save = this.db.transaction(() => {
        const existing = this.db
          .prepare(
            'SELECT id, wallet_address, jurisdiction FROM investors WHERE id = ?',
          )
          .get(investor.id) as InvestorRow | undefined;

        if (existing !== undefined) {
          if (
            existing.wallet_address !== investor.walletAddress ||
            existing.jurisdiction !== investor.jurisdiction
          ) {
            throw new AppError(
              'CONFLICT',
              'Investor is already stored with different details',
            );
          }
        } else {
          this.db
            .prepare(
              `INSERT INTO investors (id, wallet_address, jurisdiction)
               VALUES (?, ?, ?)`,
            )
            .run(investor.id, investor.walletAddress, investor.jurisdiction);
        }

        this.db
          .prepare(
            `INSERT INTO investor_eligibility
               (investor_id, product_id, wallet_address, jurisdiction,
                tier, eligible_at, authorization_tx_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            eligibility.investorId,
            eligibility.productId,
            eligibility.walletAddress,
            eligibility.jurisdiction,
            eligibility.tier,
            eligibility.eligibleAt,
            authorizationTxHash,
          );
      });

      save();
      return ok(undefined);
    } catch (error) {
      return err(mapSqliteError(error));
    }
  }
}
