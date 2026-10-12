import { prisma } from "@/lib/db";
import { EscrowState, ProblemStatus, CreditTransactionType } from "@prisma/client";
import { creditsRequiredToFund } from "./fees";

export type FundBountyResult =
  | { ok: true; reason?: undefined; required?: undefined; balance?: undefined; message?: undefined }
  | { ok: false; reason: "INSUFFICIENT_FUNDS"; required: number; balance: number; message?: undefined }
  | { ok: false; reason: "OTHER"; message: string; required?: undefined; balance?: undefined };

/**
 * Attempts to fund a Problem's Escrow directly from a Giver's credit
 * balance. This is the "balance check" step from the payment spec. If the
 * balance is insufficient, the caller (a Server Action or route) is
 * responsible for surfacing the "Add Credits via Whop" flow.
 *
 * The Giver is charged bountyAmount * 1.10 (the platform's 10% funding
 * fee) — see lib/payments/fees.ts. Escrow itself always holds exactly
 * bountyAmount, since that's the number solvers see and the number that
 * gets released on acceptance.
 */
export async function fundProblemFromCredits(params: {
  problemId: string;
  giverId: string;
}): Promise<FundBountyResult> {
  return prisma.$transaction(async (tx) => {
    // Funding must happen once per bounty. Two callers can arrive together (a
    // webhook retry and the page's own funding call, or a double click): both
    // would read DRAFT and both would charge. Locking the problem row first
    // makes the second caller wait, then see it is no longer a DRAFT.
    await tx.$queryRaw`SELECT id FROM "Problem" WHERE id = ${params.problemId} FOR UPDATE`;

    const problem = await tx.problem.findUnique({
      where: { id: params.problemId },
      include: { escrow: true },
    });

    if (!problem) return { ok: false, reason: "OTHER", message: "Problem not found" };
    if (problem.giverId !== params.giverId) {
      return { ok: false, reason: "OTHER", message: "Only the problem's giver can fund it" };
    }
    if (problem.status !== ProblemStatus.DRAFT) {
      return { ok: false, reason: "OTHER", message: "Problem is not in DRAFT status" };
    }
    if (!problem.bountyAmount) {
      return { ok: false, reason: "OTHER", message: "Problem has no bounty amount set" };
    }

    const giver = await tx.user.findUnique({ where: { id: params.giverId } });
    if (!giver) return { ok: false, reason: "OTHER", message: "Giver not found" };

    const bountyAmount = Number(problem.bountyAmount);
    const required = creditsRequiredToFund(bountyAmount); // bountyAmount + 10%

    // The debit is decided by the database, not by the balance read above: a
    // top-up or a sandbox charge landing at the same moment can no longer be
    // overwritten by a stale "balance - required" write.
    const debited = await tx.user.updateMany({
      where: { id: giver.id, creditBalance: { gte: required } },
      data: { creditBalance: { decrement: required } },
    });
    if (debited.count === 0) {
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: giver.id }, select: { creditBalance: true } });
      return { ok: false, reason: "INSUFFICIENT_FUNDS", required, balance: Number(fresh.creditBalance) };
    }
    const after = await tx.user.findUniqueOrThrow({ where: { id: giver.id }, select: { creditBalance: true } });

    const ledgerEntry = await tx.creditTransaction.create({
      data: {
        userId: giver.id,
        type: CreditTransactionType.BOUNTY_FUNDING,
        amount: -required,
        balanceAfter: after.creditBalance,
        problemId: problem.id,
      },
    });

    await tx.escrow.upsert({
      where: { problemId: problem.id },
      create: {
        problemId: problem.id,
        amount: problem.bountyAmount,
        currency: problem.currency,
        state: EscrowState.HELD,
        heldAt: new Date(),
        paymentProviderRef: ledgerEntry.id,
        paymentProviderType: "credit_wallet",
      },
      update: {
        state: EscrowState.HELD,
        heldAt: new Date(),
        paymentProviderRef: ledgerEntry.id,
        paymentProviderType: "credit_wallet",
      },
    });

    await tx.problem.update({
      where: { id: problem.id },
      // Funded bounties go straight to OPEN — that's the only status the
      // public /problems listing shows, and there is no separate "publish"
      // step in this product. FUNDED remains a valid enum value/label for
      // display purposes but is no longer used as a real transitional state.
      data: { status: ProblemStatus.OPEN },
    });

    return { ok: true };
  });
}

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type CreditUserResult = {
  /** False when this payment (whopChargeRef) had already been credited and nothing changed. */
  credited: boolean;
  /** The balance after this call (unchanged when !credited). */
  balance: number;
};

/**
 * Credits a user's wallet balance. Called by the Whop webhook after a
 * successful checkout (PURCHASE), and can be reused for REFUND if a funded
 * Problem is later cancelled with no accepted submission.
 *
 * Safe to call twice for the same payment. Whop delivers webhooks at least
 * once and retries on a timeout or an error, so the same `payment.succeeded`
 * can arrive repeatedly, even at the same moment. When a whopChargeRef is
 * given, a transaction-scoped advisory lock on that reference serializes the
 * deliveries and the ledger is checked for it before anything is added, so a
 * payment is credited exactly once. (Needs no schema change. A unique index on
 * CreditTransaction.whopChargeRef would be a good second layer once the table
 * is confirmed to have no duplicates.)
 *
 * The balance changes with an atomic increment, never "read, add, write", so
 * a debit committing at the same moment is never lost.
 */
export async function creditUserBalance(params: {
  userId: string;
  amount: number;
  type: CreditTransactionType;
  whopChargeRef?: string;
  problemId?: string;
}): Promise<CreditUserResult> {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error(`Refusing to credit a non-positive amount (${params.amount})`);
  }
  const amount = Math.round(params.amount * 100) / 100;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: params.userId }, select: { id: true, creditBalance: true } });
    if (!user) throw new Error(`User ${params.userId} not found`);

    if (params.whopChargeRef) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"whop-charge:" + params.whopChargeRef}))`;
      const already = await tx.creditTransaction.findFirst({
        where: { whopChargeRef: params.whopChargeRef },
        select: { id: true },
      });
      if (already) return { credited: false, balance: Number(user.creditBalance) };
    }

    const updated = await tx.user.update({
      where: { id: params.userId },
      data: { creditBalance: { increment: amount } },
      select: { creditBalance: true },
    });

    await tx.creditTransaction.create({
      data: {
        userId: params.userId,
        type: params.type,
        amount,
        balanceAfter: updated.creditBalance,
        whopChargeRef: params.whopChargeRef,
        problemId: params.problemId,
      },
    });

    return { credited: true, balance: Number(updated.creditBalance) };
  });
}
