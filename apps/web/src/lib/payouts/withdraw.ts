import { PayoutRequestStatus } from "@prisma/client";
import { amountPaidOnWithdrawal, withdrawalFeeFor } from "@/lib/payments/fees";
import { prisma } from "@/lib/db";

export type WithdrawResult =
  | { ok: true; payoutAmount: number; eligibleAt: Date; reason?: undefined }
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

  // Validate independently of the server action: this function is the
  // financial boundary and must not rely on callers validating input.
  if (
    !Number.isFinite(requestedAmount) ||
    requestedAmount <= 0 ||
    !Number.isSafeInteger(Math.round(requestedAmount * 100)) ||
    Math.abs(requestedAmount * 100 - Math.round(requestedAmount * 100)) > 1e-7
  ) {
    return { ok: false, reason: "Enter a valid withdrawal amount with at most two decimal places" };
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

  // A friendly early check only. The conditional update inside the
  // transaction below is the authoritative balance check.
  if (requestedAmount > Number(user.availableBalance)) {
    return { ok: false, reason: "Withdrawal amount exceeds available balance" };
  }

  const payoutAmount = amountPaidOnWithdrawal(requestedAmount);
  const feeAmount = withdrawalFeeFor(requestedAmount);
  const eligibleAt = new Date(
    Date.now() + PAYOUT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const created = await prisma.$transaction(async (tx) => {
    const debit = await tx.user.updateMany({
      where: {
        id: userId,
        availableBalance: { gte: requestedAmount },
      },
      data: {
        availableBalance: { decrement: requestedAmount },
      },
    });

    // Another request may have spent the balance after our initial read.
    if (debit.count !== 1) return false;

    await tx.payoutRequest.create({
      data: {
        userId,
        requestedAmount,
        feeAmount,
        payoutAmount,
        legalName: user.legalName!,
        bankCountry: user.bankCountry!,
        bankAccountNumber: user.bankAccountNumber!,
        bankIfscOrSwift: user.bankIfscOrSwift!,
        status: PayoutRequestStatus.PENDING,
        eligibleAt,
      },
    });

    return true;
  });

  if (!created) {
    return {
      ok: false,
      reason: "Withdrawal amount exceeds available balance",
    };
  }

  return { ok: true, payoutAmount, eligibleAt };
}

