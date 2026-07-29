import type { PaymentProvider } from "./types";
import { WhopPaymentProvider } from "./whop-provider";

/**
 * Single switch point. When Stripe is ready:
 *   1. Write src/lib/payments/stripe-provider.ts implementing PaymentProvider
 *   2. Change the line below to `return new StripeProvider()`
 * Nothing in the rest of the app needs to change.
 */
export function getPaymentProvider(): PaymentProvider {
  return new WhopPaymentProvider();
}

export type { PaymentProvider, ChargeResult, PayoutResult } from "./types";
