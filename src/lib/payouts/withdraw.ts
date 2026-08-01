import { PayoutRequestStatus } from "@prisma/client";
import { amountPaidOnWithdrawal, withdrawalFeeFor } from "@/lib/payments/fees";
import { prisma } from "@/lib/db";

export type WithdrawResult =
  | { ok: true; payoutAmount: number; eligibleAt: Date }
  | { ok: false; reason: string };

const PAYOUT_WINDOW_DAYS = 7;

/**
 * Solver-initiated withdrawal from availableBalance.
 *
 * v1 is fully manual: there is no live payout-provider call here. This
 * function debits availableBalance immediately and creates a PayoutRequest
 * row (with a snapshot of the solver's bank details at request time) that
 * shows up in the admin payout queue. The platform admin transfers the
 * money by hand via Wise, any time at or after eligibleAt (createdAt + 7
 * days), then marks the request SUCCEEDED from the admin page.
 *
 * The platform's second 5% cut (see lib/payments/fees.ts) is taken here —
 * requestedAmount leaves availableBalance, but payoutAmount (95% of that)
 * is what the admin actually wires to the bank.
 */
export async function requestWithdrawal(params: {
  userId: string;
  requestedAmount: number;
}): Promise<WithdrawResult> {
  const { userId, requestedAmount } = params;

  if (requestedAmount <= 0) {
    return { ok: false, reason: "Withdrawal amount must be greater than zero" };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, reason: "User not found" };

  if (
    !user.bankDetailsAdded ||
    !user.legalName ||
    !user.bankCountry ||
    !user.bankAccountNumber ||
    !user.bankIfscOrSwift
  ) {
    return { ok: false, reason: "Add your bank details before withdrawing" };
  }

  const balance = Number(user.availableBalance);
  if (requestedAmount > balance) {
    return { ok: false, reason: "Withdrawal amount exceeds available balance" };
  }

  const payoutAmount = amountPaidOnWithdrawal(requestedAmount);
  const feeAmount = withdrawalFeeFor(requestedAmount);
  const eligibleAt = new Date(Date.now() + PAYOUT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Debit and record atomically. There's no external call to wait on here
  // (v1 has no live payout API) — the balance leaves availableBalance the
  // moment the request is made, and the admin queue is the source of truth
  // for what's still owed.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { availableBalance: { decrement: requestedAmount } },
    }),
    prisma.payoutRequest.create({
      data: {
        userId,
        requestedAmount,
        feeAmount,
        payoutAmount,
        legalName: user.legalName,
        bankCountry: user.bankCountry,
        bankAccountNumber: user.bankAccountNumber,
        bankIfscOrSwift: user.bankIfscOrSwift,
        status: PayoutRequestStatus.PENDING,
        eligibleAt,
      },
    }),
  ]);

  return { ok: true, payoutAmount, eligibleAt };
}
