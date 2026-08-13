"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { REVIEW_COST_USD, FREE_REVIEWS_PER_PROBLEM } from "./pricing";

export async function triggerSubmissionReview(submissionId: string, giverId: string) {
  return await prisma.$transaction(async (tx) => {
    const submission = await tx.submission.findUnique({
      where: { id: submissionId },
      include: { problem: true },
    });

    if (!submission) {
      throw new Error("Submission not found");
    }

    if (submission.problem.giverId !== giverId) {
      throw new Error("Unauthorized");
    }

    const problem = submission.problem;
    const isFree = problem.freeReviewsUsed < FREE_REVIEWS_PER_PROBLEM;

    if (!isFree) {
      const giver = await tx.user.findUnique({
        where: { id: giverId },
        select: { creditBalance: true },
      });

      if (!giver || giver.creditBalance.toNumber() < REVIEW_COST_USD) {
        throw new Error("INSUFFICIENT_FUNDS");
      }

      const newBalance = giver.creditBalance.toNumber() - REVIEW_COST_USD;

      // Deduct balance
      await tx.user.update({
        where: { id: giverId },
        data: { creditBalance: newBalance },
      });

      // Record transaction
      await tx.creditTransaction.create({
        data: {
          userId: giverId,
          type: "SUBMISSION_REVIEW",
          amount: -REVIEW_COST_USD,
          balanceAfter: newBalance,
          problemId: problem.id,
          submissionId: submission.id,
        },
      });
    } else {
      // Increment free review count
      await tx.problem.update({
        where: { id: problem.id },
        data: { freeReviewsUsed: { increment: 1 } },
      });
    }

    // Call sandbox execution API route internally or directly
    revalidatePath(/dashboard/giver/problems/ + problem.id);
    return { success: true, charged: !isFree };
  });
}