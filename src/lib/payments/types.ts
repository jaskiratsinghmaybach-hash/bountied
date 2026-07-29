/**
 * Payment provider abstraction.
 *
 * Why this exists: v1 uses Whop (you already have it set up), but the plan
 * is to move to Stripe at final launch. Every other part of the codebase
 * (escrow logic, API routes) should talk to THIS interface, never to the
 * Whop SDK directly. When Stripe is ready, we write StripeProvider and
 * flip one line in getPaymentProvider() — nothing else changes.
 */

export interface ChargeResult {
  /** Generic reference stored in Escrow.paymentProviderRef */
  providerRef: string;
  status: "succeeded" | "pending" | "failed";
  raw?: unknown;
}

export interface PayoutResult {
  providerRef: string;
  status: "succeeded" | "pending" | "failed";
  raw?: unknown;
}

export interface PaymentProvider {
  /**
   * Capture funds from the problem-giver into platform-held escrow.
   * Called when a problem moves DRAFT -> FUNDED.
   */
  chargeForEscrow(params: {
    userId: string;
    amount: number; // in major currency units, e.g. dollars not cents
    currency: string;
    problemId: string;
  }): Promise<ChargeResult>;

  /**
   * Release held funds to a solver's connected account.
   * Called ONLY by src/lib/escrow/release.ts after a submission is accepted.
   */
  payoutToSolver(params: {
    solverId: string;
    amount: number;
    currency: string;
    escrowId: string;
  }): Promise<PayoutResult>;

  /**
   * Refund held funds back to the problem-giver.
   * Called when a problem is cancelled/expired with no accepted submission.
   */
  refundToGiver(params: {
    giverId: string;
    amount: number;
    currency: string;
    escrowId: string;
  }): Promise<PayoutResult>;

  /**
   * Verify a user has a connected payout destination + passes basic KYC.
   * Maps to your "simple identity + bank verification" requirement.
   */
  isPayoutReady(userId: string): Promise<boolean>;
}
