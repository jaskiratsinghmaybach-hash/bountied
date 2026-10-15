"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db";
import { PayoutRequestStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";


export async function markPayoutSucceeded(payoutRequestId: string) {
  const admin = await requireAdmin();
  if (!admin) throw new Error("Not authorized");

  const result = await prisma.payoutRequest.updateMany({
    where: {
      id: payoutRequestId,
      status: PayoutRequestStatus.PENDING,
    },
    data: {
      status: PayoutRequestStatus.SUCCEEDED,
      completedAt: new Date(),
    },
  });

  if (result.count !== 1) {
    throw new Error("Payout request not found or is no longer pending");
  }

  revalidatePath("/admin/payouts");
}

export async function markPayoutFailed(payoutRequestId: string) {
  const admin = await requireAdmin();
  if (!admin) throw new Error("Not authorized");

  await prisma.$transaction(async (tx) => {
    // Claim the pending -> failed transition first. Only the request
    // that wins this conditional update is allowed to issue a refund.
    const transition = await tx.payoutRequest.updateMany({
      where: {
        id: payoutRequestId,
        status: PayoutRequestStatus.PENDING,
      },
      data: {
        status: PayoutRequestStatus.FAILED,
        completedAt: new Date(),
      },
    });

    if (transition.count !== 1) {
      throw new Error("Payout request not found or is no longer pending");
    }

    const payoutRequest = await tx.payoutRequest.findUnique({
      where: { id: payoutRequestId },
      select: { userId: true, requestedAmount: true },
    });

    if (!payoutRequest) {
      throw new Error("Payout request not found");
    }

    await tx.user.update({
      where: { id: payoutRequest.userId },
      data: {
        availableBalance: { increment: payoutRequest.requestedAmount },
      },
    });
  });

  revalidatePath("/admin/payouts");
}

