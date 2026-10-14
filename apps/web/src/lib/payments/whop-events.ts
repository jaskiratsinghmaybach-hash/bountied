import { CreditTransactionType } from "@prisma/client";
import { creditUserBalance, fundProblemFromCredits } from "./credits";
import { parseDepositAmount } from "./deposit";

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type WhopEventResult = { status: number; body: Record<string, unknown> };

type WhopPaymentData = {
  id?: unknown;
  metadata?: Record<string, unknown>;
  currency?: unknown;
  final_amount?: unknown;
  total?: unknown;
};
type WhopEvent = { type?: string; data?: WhopPaymentData };

function readAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const amount = (value as Record<string, unknown>).amount;
    if (typeof amount === "number" && Number.isFinite(amount)) return amount;
    if (typeof amount === "string" && amount.trim() !== "" && Number.isFinite(Number(amount))) return Number(amount);
  }
  return null;
}

/** Whop payment payloads expose the customer charge as final_amount or total.amount. */
function actualPaymentAmount(data: WhopPaymentData): number | null {
  return readAmount(data.final_amount) ?? readAmount(data.total);
}

const text = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

/**
 * What to do with a Whop event AFTER its signature has been verified (that
 * stays in the route). A top-up is for whoever started the checkout, Giver or
 * Solver alike: the user id is the one the server put in the checkout's
 * metadata. Older in-flight checkouts carry it as `giverId`, so both are read.
 *
 * Idempotent: a repeated delivery of the same payment credits nothing more,
 * but still retries funding a draft bounty (which only happens while the
 * problem is still a DRAFT), so a delivery that crashed between the two steps
 * is finished by Whop's retry.
 */
export async function handleWhopEvent(event: WhopEvent): Promise<WhopEventResult> {
  if (event.type !== "payment.succeeded") return { status: 200, body: { received: true } };

  const metadata = event.data?.metadata ?? {};
  const userId = text(metadata.userId) ?? text(metadata.giverId);
  const draftProblemId = text(metadata.draftProblemId);
  const chargeRef = text(event.data?.id);

  if (!userId || metadata.requiredAmount === undefined) {
    return { status: 400, body: { error: "Missing metadata on event" } };
  }
  // Without a payment id a retry could not be recognised, so refuse rather than risk crediting twice.
  if (!chargeRef) return { status: 400, body: { error: "Missing payment id on event" } };

  const amount = parseDepositAmount(Number(metadata.requiredAmount));
  if (!amount.ok || amount.amount === undefined) {
    console.error("Whop payment with an invalid credit amount:", chargeRef, String(metadata.requiredAmount));
    return { status: 400, body: { error: "Invalid amount on event" } };
  }

  // Checkout metadata is our expected amount, not proof of what Whop charged.
  // Fail closed if the provider payload doesn't contain a verifiable charge.
  const paidAmount = actualPaymentAmount(event.data ?? {});
  if (paidAmount === null || Math.abs(paidAmount - amount.amount) > 0.009) {
    console.error("Whop payment amount missing or mismatched:", chargeRef);
    return { status: 400, body: { error: "Payment amount could not be verified" } };
  }
  const total = event.data?.total && typeof event.data.total === "object"
    ? event.data.total as Record<string, unknown>
    : null;
  const rawCurrency = event.data?.currency ?? total?.currency;
  const currency = typeof rawCurrency === "string" ? rawCurrency.toUpperCase() : null;
  if (currency !== "USD") {
    console.error("Whop payment currency missing or mismatched:", chargeRef, currency ?? "missing");
    return { status: 400, body: { error: "Payment currency could not be verified" } };
  }

  const credit = await creditUserBalance({
    userId,
    amount: amount.amount,
    type: CreditTransactionType.PURCHASE,
    whopChargeRef: chargeRef,
  });

  if (draftProblemId) {
    await fundProblemFromCredits({ problemId: draftProblemId, giverId: userId });
  }

  return { status: 200, body: { received: true, credited: credit.credited } };
}
