import type { Eligibility, Tier } from '../identity/eligibility';
import { createInvestor } from '../identity/investor';
import { meetsMinimumTier } from '../identity/policy';
import { issuePassport } from '../identity/passport';
import type { ChainPort } from '../ports/chain.port';
import type { ClockPort } from '../ports/clock.port';
import type { DomainEvent, EventBusPort } from '../ports/event-bus.port';
import type { InvestorRepositoryPort } from '../ports/investor.repository.port';
import type { PolicyPort } from '../ports/policy.port';
import type { KycPort } from '../identity/kyc.port';
import { AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';

export const USTBL_ASSET_CODE = 'USTBL';

export interface OnboardInvestorInput {
  investorId: string;
  wallet: string;
  jurisdiction: string;
  productId: string;
}

export interface OnboardInvestorResult {
  eligibility: Eligibility;
  authorizationTxHash: string;
}

export interface InvestorKycApprovedPayload {
  readonly investorId: string;
  readonly productId: string;
  readonly walletAddress: string;
  readonly jurisdiction: string;
  readonly tier: Tier;
  readonly eligibleAt: string;
  readonly authorizationTxHash: string;
}

export interface OnboardInvestorDeps {
  policy: PolicyPort;
  kyc: KycPort;
  chain: ChainPort;
  investors: InvestorRepositoryPort;
  events: EventBusPort;
  clock: ClockPort;
}

/**
 * Onboard one investor into one product:
 * policy -> KYC -> passport -> trustline authorization -> persistence -> event.
 * Replays return the stored eligibility and authorization hash without
 * repeating KYC or chain calls.
 */
export class OnboardInvestor {
  constructor(private readonly deps: OnboardInvestorDeps) {}

  async execute(
    input: OnboardInvestorInput,
  ): Promise<Result<OnboardInvestorResult, AppError>> {
    const investorResult = createInvestor({
      id: input.investorId,
      walletAddress: input.wallet,
      jurisdiction: input.jurisdiction,
    });
    if (!investorResult.ok) return investorResult;
    const investor = investorResult.value;

    const existing = this.deps.investors.findEligibility(
      investor.id,
      input.productId,
    );
    if (!existing.ok) return existing;
    if (existing.value !== null) {
      if (
        existing.value.eligibility.walletAddress !== investor.walletAddress ||
        existing.value.eligibility.jurisdiction !== investor.jurisdiction
      ) {
        return err(
          new AppError(
            'CONFLICT',
            'Investor is already onboarded with different details',
          ),
        );
      }
      return ok({
        eligibility: existing.value.eligibility,
        authorizationTxHash: existing.value.authorizationTxHash,
      });
    }

    const policyResult = this.deps.policy.getPolicy(input.productId);
    if (!policyResult.ok) return policyResult;
    const policy = policyResult.value;

    const kycResult = await this.deps.kyc.verify({
      investorId: investor.id,
      jurisdiction: investor.jurisdiction,
    });
    if (!kycResult.ok) return kycResult;
    const verification = kycResult.value;

    const now = this.deps.clock.now();
    const passport = issuePassport(investor, verification, policy, now);
    if (!passport.ok) return passport;

    if (!meetsMinimumTier(verification.tier, policy.minTier)) {
      return err(
        new AppError(
          'KYC_REJECTED',
          'Investor tier does not meet the product minimum',
        ),
      );
    }

    const authorized = await this.deps.chain.authorizeTrustline(
      investor.walletAddress,
      USTBL_ASSET_CODE,
    );
    if (!authorized.ok) return authorized;

    const saved = this.deps.investors.saveOnboarded(
      investor,
      passport.value,
      authorized.value,
    );
    if (!saved.ok) return saved;

    const event: DomainEvent<
      'investor.kyc.approved',
      InvestorKycApprovedPayload
    > = {
      type: 'investor.kyc.approved',
      occurredAt: now.toISOString(),
      payload: {
        investorId: passport.value.investorId,
        productId: passport.value.productId,
        walletAddress: passport.value.walletAddress,
        jurisdiction: passport.value.jurisdiction,
        tier: passport.value.tier,
        eligibleAt: passport.value.eligibleAt,
        authorizationTxHash: authorized.value,
      },
    };

    try {
      await this.deps.events.publish(event);
    } catch (error) {
      return err(
        new AppError('INTERNAL', 'Failed to publish investor.kyc.approved', error),
      );
    }

    return ok({
      eligibility: passport.value,
      authorizationTxHash: authorized.value,
    });
  }
}
