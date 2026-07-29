import type { PaymentProvider, ChargeResult, PayoutResult } from "./types";

/**
 * Whop implementation of PaymentProvider.
 *
 * TODO (when you wire this up):
 *  - npm install @whop/api (or whatever the current Whop SDK package is —
 *    check https://dev.whop.com for the current package name, it has changed before)
 *  - Set WHOP_API_KEY, WHOP_APP_ID in .env
 *  - Whop's model is subscription/product-purchase-centric, not a generic
 *    escrow/payout API like Stripe Connect. You will likely need to:
 *      1. Charge the giver via a Whop checkout session for the bounty amount
 *      2. Hold that as "platform revenue" internally (your own ledger row,
 *         i.e. the Escrow model already in the schema) since Whop doesn't
 *         natively know about your escrow concept
 *      3. Pay solvers out manually/via a separate flow until Stripe Connect
 *         replaces this — Whop is not designed for paying out third parties
 *         who aren't creators on Whop's platform. This is the biggest
 *         reason this whole class is an interface: expect this file's
 *         internals to change a lot before it changes shape.
 */
export class WhopPaymentProvider implements PaymentProvider {
  async chargeForEscrow(params: {
    userId: string;
    amount: number;
    currency: string;
    problemId: string;
  }): Promise<ChargeResult> {
    // TODO: create a Whop checkout/charge for params.amount, tagged with problemId
    throw new Error(
      "WhopPaymentProvider.chargeForEscrow not implemented yet — wire up Whop SDK here"
    );
  }

  async payoutToSolver(params: {
    solverId: string;
    amount: number;
    currency: string;
    escrowId: string;
  }): Promise<PayoutResult> {
    // TODO: Whop does not natively support arbitrary third-party payouts.
    // Likely needs a manual/batched payout flow for v1, or an early move
    // to Stripe Connect Express accounts for solvers specifically.
    throw new Error(
      "WhopPaymentProvider.payoutToSolver not implemented yet — see TODO above"
    );
  }

  async refundToGiver(params: {
    giverId: string;
    amount: number;
    currency: string;
    escrowId: string;
  }): Promise<PayoutResult> {
    throw new Error(
      "WhopPaymentProvider.refundToGiver not implemented yet — wire up Whop SDK here"
    );
  }

  async isPayoutReady(userId: string): Promise<boolean> {
    // TODO: check bankVerified + identityVerified on the User row for now;
    // later this should also check a real connected payout destination.
    throw new Error(
      "WhopPaymentProvider.isPayoutReady not implemented yet"
    );
  }
}
