/**
 * Payment provider abstraction.
 *
 * Why this exists: v1 uses Whop for the GIVER side only (collecting credit
 * top-ups). Solver payouts are manual in v1 — the platform admin transfers
 * money by hand via Wise using the bank details a solver submits directly
 * in the app (see lib/payouts/withdraw.ts and the PayoutRequest model).
 * There is no payout-provider integration to abstract yet.
 *
 * Every other part of the codebase (escrow logic, API routes) should talk
 * to THIS interface, never to the Whop SDK directly. When automated
 * payouts are built (Wise API, or a Stripe migration), extend this
 * interface then — don't build it out speculatively now.
 */

export interface ChargeResult {
  /** Generic reference stored in Escrow.paymentProviderRef */
  providerRef: string;
  status: "succeeded" | "pending" | "failed";
  raw?: unknown;
}

export interface CheckoutSessionResult {
  /** Whop plan id — pass to <WhopCheckoutEmbed planId={...} /> to render the embedded checkout. */
  planId: string;
  /** Whop checkout configuration id, for reconciling this session later if needed. */
  checkoutConfigId: string;
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
   * Creates an embedded Whop checkout configuration for a Giver to buy
   * platform credits. metadata should include enough to reconcile the
   * webhook back to this user/action (e.g. userId, draftProblemId if
   * funding a specific problem).
   */
  createCreditCheckoutSession(params: {
    userId: string;
    amount: number;
    currency: string;
    metadata: Record<string, string>;
  }): Promise<CheckoutSessionResult>;
}
