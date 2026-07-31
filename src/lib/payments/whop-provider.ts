import type {
  PaymentProvider,
  ChargeResult,
  PayoutResult,
  BankDetailsPayload,
  PayoutMethodResult,
  CheckoutSessionResult,
} from "./types";
import { prisma } from "@/lib/db";

const WHOP_API_BASE = "https://api.whop.com";

function whopHeaders() {
  if (!process.env.WHOP_API_KEY) {
    throw new Error("WHOP_API_KEY is not set in .env");
  }
  return {
    Authorization: `Bearer ${process.env.WHOP_API_KEY}`,
    "Content-Type": "application/json",
  };
}

/**
 * Whop implementation of PaymentProvider.
 *
 * chargeForEscrow and refundToGiver remain unimplemented for now — under the
 * credit-wallet design, funding a Problem from an existing balance never
 * calls Whop directly. Whop is only touched (a) to top up a Giver's balance
 * via Checkout, and (b) to pay a Solver out.
 */
export class WhopPaymentProvider implements PaymentProvider {
  async chargeForEscrow(params: {
    userId: string;
    amount: number;
    currency: string;
    problemId: string;
  }): Promise<ChargeResult> {
    throw new Error(
      "chargeForEscrow not used under the credit-wallet model — fund via createCreditCheckoutSession + webhook instead"
    );
  }

  async payoutToSolver(params: {
    solverId: string;
    amount: number;
    currency: string;
    escrowId: string;
  }): Promise<PayoutResult> {
    const solver = await prisma.user.findUnique({ where: { id: params.solverId } });

    if (!solver?.whopPayoutMethodId) {
      return {
        providerRef: "",
        status: "failed",
        raw: { reason: "Solver has no vaulted payout method" },
      };
    }

    const res = await fetch(`${WHOP_API_BASE}/v1/payouts/create-payout`, {
      method: "POST",
      headers: whopHeaders(),
      body: JSON.stringify({
        payout_method_id: solver.whopPayoutMethodId,
        amount: params.amount,
        currency: params.currency,
        metadata: { escrowId: params.escrowId, solverId: params.solverId },
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { providerRef: "", status: "failed", raw: data };
    }

    return {
      providerRef: data.id ?? data.payout_id ?? "",
      status: "succeeded",
      raw: data,
    };
  }

  async refundToGiver(params: {
    giverId: string;
    amount: number;
    currency: string;
    escrowId: string;
  }): Promise<PayoutResult> {
    throw new Error(
      "refundToGiver not implemented yet — under the credit-wallet model, refunding a cancelled Problem should credit User.creditBalance back directly"
    );
  }

  async isPayoutReady(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return Boolean(user?.bankVerified && user?.whopPayoutMethodId);
  }

  async createPayoutMethod(params: {
    userId: string;
    bankDetails: BankDetailsPayload;
  }): Promise<PayoutMethodResult> {
    const res = await fetch(`${WHOP_API_BASE}/v1/payouts/create-payout-method`, {
      method: "POST",
      headers: whopHeaders(),
      body: JSON.stringify({
        legal_name: params.bankDetails.legalName,
        country: params.bankDetails.country,
        ...params.bankDetails.fields,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        status: "failed",
        fieldErrors: data.errors ?? { _general: data.message ?? "Verification failed" },
        raw: data,
      };
    }

    return {
      status: "succeeded",
      payoutMethodId: data.id ?? data.payout_method_id,
      raw: data,
    };
  }

  async createCreditCheckoutSession(params: {
    userId: string;
    amount: number;
    currency: string;
    metadata: Record<string, string>;
  }): Promise<CheckoutSessionResult> {
    const res = await fetch(`${WHOP_API_BASE}/v1/checkout/sessions`, {
      method: "POST",
      headers: whopHeaders(),
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency,
        metadata: params.metadata,
        redirect_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/giver`,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(`Whop checkout session creation failed: ${JSON.stringify(data)}`);
    }

    return {
      checkoutUrl: data.checkout_url ?? data.url,
      sessionId: data.id,
      raw: data,
    };
  }
}
