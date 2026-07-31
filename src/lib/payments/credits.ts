import { prisma } from "@/lib/db";
import { EscrowState, ProblemStatus, CreditTransactionType } from "@prisma/client";

export type FundBountyResult =
  | { ok: true }
  | { ok: false; reason: "INSUFFICIENT_FUNDS"; required: number; balance: number }
  | { ok: false; reason: string };

/**
 * Attempts to fund a Problem's Escrow directly from a Giver's credit
 * balance. This is the "balance check" step from the payment spec. If the
 * balance is insufficient, the caller (a Server Action or route) is
 * responsible for surfacing the "Add Credits via Whop" flow.
 */
export async function fundProblemFromCredits(params: {
  problemId: string;
  giverId: string;
}): Promise<FundBountyResult> {
  return prisma.$transaction(async (tx) => {
    const problem = await tx.problem.findUnique({
      where: { id: params.problemId },
      include: { escrow: true },
    });

    if (!problem) return { ok: false, reason: "Problem not found" };
    if (problem.giverId !== params.giverId) {
      return { ok: false, reason: "Only the problem's giver can fund it" };
    }
    if (problem.status !== ProblemStatus.DRAFT) {
      return { ok: false, reason: "Problem is not in DRAFT status" };
    }
    if (!problem.bountyAmount) {
      return { ok: false, reason: "Problem has no bounty amount set" };
    }

    const giver = await tx.user.findUnique({ where: { id: params.giverId } });
    if (!giver) return { ok: false, reason: "Giver not found" };

    const required = Number(problem.bountyAmount);
    const balance = Number(giver.creditBalance);

    if (balance < required) {
      return { ok: false, reason: "INSUFFICIENT_FUNDS", required, balance };
    }

    const newBalance = balance - required;

    const ledgerEntry = await tx.creditTransaction.create({
      data: {
        userId: giver.id,
        type: CreditTransactionType.BOUNTY_FUNDING,
        amount: -required,
        balanceAfter: newBalance,
        problemId: problem.id,
      },
    });

    await tx.user.update({
      where: { id: giver.id },
      data: { creditBalance: newBalance },
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
      data: { status: ProblemStatus.FUNDED },
    });

    return { ok: true };
  });
}

/**
 * Credits a user's wallet balance. Called by the Whop webhook after a
 * successful checkout (PURCHASE), and can be reused for REFUND if a funded
 * Problem is later cancelled with no accepted submission.
 */
export async function creditUserBalance(params: {
  userId: string;
  amount: number;
  type: CreditTransactionType;
  whopChargeRef?: string;
  problemId?: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: params.userId } });
    if (!user) throw new Error(`User ${params.userId} not found`);

    const newBalance = Number(user.creditBalance) + params.amount;

    await tx.creditTransaction.create({
      data: {
        userId: params.userId,
        type: params.type,
        amount: params.amount,
        balanceAfter: newBalance,
        whopChargeRef: params.whopChargeRef,
        problemId: params.problemId,
      },
    });

    await tx.user.update({
      where: { id: params.userId },
      data: { creditBalance: newBalance },
    });
  });
}
