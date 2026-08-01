import { PayoutRequestStatus } from "@prisma/client";
import { getPaymentProvider } from "@/lib/payments";
import { amountPaidOnWithdrawal, withdrawalFeeFor } from "@/lib/payments/fees";
import { prisma } from "@/lib/db";

export type WithdrawResult =
  | { ok: true; payoutAmount: number }
  | { ok: false; reason: string };

/**
 * Solver-initiated withdrawal from availableBalance to their verified bank
 * account. Mirrors the trust pattern in lib/escrow/release.ts: money moves
 * (or the attempt is recorded) BEFORE any balance is deducted, and this is
 * the only function allowed to debit User.availableBalance for a payout.
 *
 * The platform's second 5% cut (see lib/payments/fees.ts) is taken here —
 * requestedAmount leaves availableBalance, but only
 * amountPaidOnWithdrawal(requestedAmount) is actually wired to the bank.
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

  if (!user.bankVerified || !user.whopPayoutMethodId) {
    return { ok: false, reason: "Verify your bank account before withdrawing" };
  }

  const balance = Number(user.availableBalance);
  if (requestedAmount > balance) {
    return { ok: false, reason: "Withdrawal amount exceeds available balance" };
  }

  const payoutAmount = amountPaidOnWithdrawal(requestedAmount);
  const feeAmount = withdrawalFeeFor(requestedAmount);

  // 1. Record the request as PENDING first.
  const payoutRequest = await prisma.payoutRequest.create({
    data: {
      userId,
      requestedAmount,
      feeAmount,
      payoutAmount,
      status: PayoutRequestStatus.PENDING,
    },
  });

  // 2. Call out to the payment provider. If this throws or fails, the
  //    PayoutRequest stays PENDING/FAILED and availableBalance is never
  //    touched — nothing is deducted until money has actually moved.
  const provider = getPaymentProvider();
  let payout;
  try {
    payout = await provider.payoutToSolver({
      solverId: userId,
      amount: payoutAmount,
      currency: "USD",
      escrowId: payoutRequest.id,
    });
  } catch (err) {
    await prisma.payoutRequest.update({
      where: { id: payoutRequest.id },
      data: { status: PayoutRequestStatus.FAILED },
    });
    return { ok: false, reason: err instanceof Error ? err.message : "Payout failed" };
  }

  if (payout.status !== "succeeded") {
    await prisma.payoutRequest.update({
      where: { id: payoutRequest.id },
      data: { status: PayoutRequestStatus.FAILED },
    });
    return { ok: false, reason: `Payout did not succeed: ${payout.status}` };
  }

  // 3. Only now debit availableBalance and mark the request succeeded.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { availableBalance: { decrement: requestedAmount } },
    }),
    prisma.payoutRequest.update({
      where: { id: payoutRequest.id },
      data: {
        status: PayoutRequestStatus.SUCCEEDED,
        providerRef: payout.providerRef,
        completedAt: new Date(),
      },
    }),
  ]);

  return { ok: true, payoutAmount };
}
