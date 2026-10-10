"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db";
import { PayoutRequestStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function markPayoutSucceeded(payoutRequestId: string) {
  const admin = await requireAdmin();
  if (!admin) throw new Error("Not authorized");

  await prisma.payoutRequest.update({
    where: { id: payoutRequestId },
    data: { status: PayoutRequestStatus.SUCCEEDED, completedAt: new Date() },
  });

  revalidatePath("/admin/payouts");
}

export async function markPayoutFailed(payoutRequestId: string) {
  const admin = await requireAdmin();
  if (!admin) throw new Error("Not authorized");

  // Refund: a failed manual transfer means the solver never got paid, so
  // the amount they requested goes back into their available balance.
  const payoutRequest = await prisma.payoutRequest.findUnique({
    where: { id: payoutRequestId },
  });
  if (!payoutRequest) throw new Error("Payout request not found");
  if (payoutRequest.status !== PayoutRequestStatus.PENDING) {
    throw new Error("Only pending requests can be marked failed");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: payoutRequest.userId },
      data: { availableBalance: { increment: payoutRequest.requestedAmount } },
    }),
    prisma.payoutRequest.update({
      where: { id: payoutRequestId },
      data: { status: PayoutRequestStatus.FAILED, completedAt: new Date() },
    }),
  ]);

  revalidatePath("/admin/payouts");
}
