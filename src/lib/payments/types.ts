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

export interface BankDetailsPayload {
  legalName: string;
  country: string;
  fields: Record<string, string>;
}

export interface PayoutMethodResult {
  status: "succeeded" | "failed";
  payoutMethodId?: string;
  fieldErrors?: Record<string, string>;
  raw?: unknown;
}

export interface CheckoutSessionResult {
  checkoutUrl: string;
  sessionId: string;
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

  /**
   * Vaults a solver's bank details with the provider and returns a tokenized
   * payout method id. We NEVER store raw account/routing/IBAN numbers
   * ourselves — only whatever token the provider gives back.
   */
  createPayoutMethod(params: {
    userId: string;
    bankDetails: BankDetailsPayload;
  }): Promise<PayoutMethodResult>;

  /**
   * Creates a hosted checkout session for a Giver to buy platform credits.
   * metadata should include enough to reconcile the webhook back to this
   * user/action (e.g. userId, draftProblemId if funding a specific problem).
   */
  createCreditCheckoutSession(params: {
    userId: string;
    amount: number;
    currency: string;
    metadata: Record<string, string>;
  }): Promise<CheckoutSessionResult>;
}
