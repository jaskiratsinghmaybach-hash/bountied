import Whop from "@whop/sdk";
import type { PaymentProvider, ChargeResult, CheckoutSessionResult } from "./types";

function getClient() {
  if (!process.env.WHOP_API_KEY) {
    throw new Error("WHOP_API_KEY is not set in .env");
  }
  return new Whop({ apiKey: process.env.WHOP_API_KEY });
}

function getAccountId() {
  if (!process.env.WHOP_COMPANY_ID) {
    throw new Error(
      "WHOP_COMPANY_ID is not set in .env — copy it from your Whop dashboard URL (whop.com/dashboard/biz_XXXXXXXXX/)"
    );
  }
  return process.env.WHOP_COMPANY_ID;
}

/**
 * Whop implementation of PaymentProvider — GIVER side only.
 *
 * v1 scope: Whop collects credit top-ups from Givers via an embedded
 * checkout (see @whop/checkout on the frontend). It does not handle
 * Solver payouts — those are manual in v1, see lib/payouts/withdraw.ts.
 *
 * chargeForEscrow is unused under the credit-wallet design: funding a
 * Problem draws from the Giver's already-topped-up creditBalance, it
 * never calls Whop directly at fund time.
 */
export class WhopPaymentProvider implements PaymentProvider {
  async chargeForEscrow(): Promise<ChargeResult> {
    throw new Error(
      "chargeForEscrow not used under the credit-wallet model — fund via createCreditCheckoutSession + webhook instead"
    );
  }

  async createCreditCheckoutSession(params: {
    userId: string;
    amount: number;
    currency: string;
    metadata: Record<string, string>;
  }): Promise<CheckoutSessionResult> {
    const client = getClient();

    // Current Whop SDK typings expect the account identifier to be sent as
    // `account_id` inside the inline plan payload, not `company_id`.
    const checkoutConfig = await client.checkoutConfigurations.create({
      plan: {
        account_id: getAccountId(),
        initial_price: params.amount,
        plan_type: "one_time",
        currency: params.currency.toLowerCase(),
      },
      metadata: {
        userId: params.userId,
        ...params.metadata,
      },
    });

    if (!checkoutConfig.plan?.id) {
      throw new Error(
        `Whop checkout configuration created but returned no plan id: ${JSON.stringify(checkoutConfig)}`
      );
    }

    return {
      planId: checkoutConfig.plan.id,
      checkoutConfigId: checkoutConfig.id,
      raw: checkoutConfig,
    };
  }
}