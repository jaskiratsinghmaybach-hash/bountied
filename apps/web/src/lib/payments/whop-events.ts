import { CreditTransactionType } from "@prisma/client";
import { creditUserBalance, fundProblemFromCredits } from "./credits";
import { parseDepositAmount } from "./deposit";

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type WhopEventResult = { status: number; body: Record<string, unknown> };

type WhopEvent = { type?: string; data?: { id?: unknown; metadata?: Record<string, unknown> } };

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
