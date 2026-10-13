import { prisma } from "@/lib/db";
import { runAndRecordSubmission } from "@/lib/sandbox/run-submission";
import { FREE_REVIEWS_PER_PROBLEM, REVIEW_COST_USD } from "./pricing";

/**
 * The ONLY way to start a sandbox review. Deliberately NOT a "use server"
 * file: every export of a "use server" module is callable from any browser
 * with arbitrary arguments, which is how the old triggerSubmissionReview(
 * submissionId, giverId) let a caller pass someone else's giverId.
 *
 * Callers must pass a giverId they have ALREADY authenticated:
 *   - /api/sandbox/run          -> from the Supabase session cookie
 *   - /api/desktop/sandbox/run  -> from the verified device token
 * Never from a request body or URL.
 *
 * Charging and running are one operation. Before, "charge" (server action)
 * and "run" (API route) were two separate calls with nothing linking them, so
 * the route could be hit directly for free runs.
 */

export type ReviewErrorCode = "NOT_FOUND" | "FORBIDDEN" | "NOT_READY" | "INSUFFICIENT_FUNDS";

export class ReviewError extends Error {
  code: ReviewErrorCode;
  constructor(code: ReviewErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Atomically: verify the caller owns the problem, claim the submission
 * (AWAITING_REVIEW -> RUNNING, so only one request can ever proceed), then
 * consume a free review or charge the wallet. All in one transaction: if
 * anything throws, the claim and the charge are both rolled back.
 *
 * Each step is a conditional UPDATE decided by the database, not by a value
 * read earlier, so double-clicks and parallel requests can't double-charge
 * or grant extra free reviews.
 */
export async function claimAndChargeReview(submissionId: string, giverId: string) {
  return prisma.$transaction(async (tx) => {
    const submission = await tx.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, problem: { select: { id: true, giverId: true } } },
    });
    if (!submission) throw new ReviewError("NOT_FOUND", "Submission not found");
    if (submission.problem.giverId !== giverId) throw new ReviewError("FORBIDDEN", "Not authorized");
    const problemId = submission.problem.id;

    const claimed = await tx.submission.updateMany({
      where: {
        id: submissionId,
        status: "AWAITING_REVIEW",
        platformRepoFullName: { not: null },
        platformRepoUrl: { not: null },
      },
      data: { status: "RUNNING" },
    });
    if (claimed.count !== 1) throw new ReviewError("NOT_READY", "This submission isn't ready for a review");

    const free = await tx.problem.updateMany({
      where: { id: problemId, freeReviewsUsed: { lt: FREE_REVIEWS_PER_PROBLEM } },
      data: { freeReviewsUsed: { increment: 1 } },
    });
    if (free.count === 1) return { charged: false, problemId };

    const paid = await tx.user.updateMany({
      where: { id: giverId, creditBalance: { gte: REVIEW_COST_USD } },
      data: { creditBalance: { decrement: REVIEW_COST_USD } },
    });
    if (paid.count !== 1) throw new ReviewError("INSUFFICIENT_FUNDS", "Insufficient credit for a review");

    const giver = await tx.user.findUniqueOrThrow({ where: { id: giverId }, select: { creditBalance: true } });
    await tx.creditTransaction.create({
      data: {
        userId: giverId,
        type: "SUBMISSION_REVIEW",
        amount: -REVIEW_COST_USD,
        balanceAfter: giver.creditBalance,
        problemId,
        submissionId,
      },
    });
    return { charged: true, problemId };
  });
}

/**
 * Gives a Giver back exactly what claimAndChargeReview took: the free review
 * (freeReviewsUsed goes back down) or the $0.04 (credited back and logged as a
 * REFUND), and puts the submission back to AWAITING_REVIEW so it can be run
 * again. For a run that ended because of the platform or the setup, not the
 * Solver's code failing. Callers invoke this at most once per claim:
 * startAndRunReview does, and the claim itself can only be won once.
 */
export async function refundReview(params: {
  giverId: string;
  problemId: string;
  submissionId: string;
  /** The value claimAndChargeReview returned: false = a free review was used. */
  charged: boolean;
}): Promise<boolean> {
  const { giverId, problemId, submissionId, charged } = params;
  return prisma.$transaction(async (tx) => {
    let refunded: boolean;
    if (!charged) {
      // Never below zero: a conditional decrement decided by the database.
      const freed = await tx.problem.updateMany({
        where: { id: problemId, freeReviewsUsed: { gt: 0 } },
        data: { freeReviewsUsed: { decrement: 1 } },
      });
      refunded = freed.count === 1;
    } else {
      await tx.user.update({
        where: { id: giverId },
        data: { creditBalance: { increment: REVIEW_COST_USD } },
      });
      const giver = await tx.user.findUniqueOrThrow({ where: { id: giverId }, select: { creditBalance: true } });
      await tx.creditTransaction.create({
        data: {
          userId: giverId,
          type: "REFUND",
          amount: REVIEW_COST_USD,
          balanceAfter: giver.creditBalance,
          problemId,
          submissionId,
        },
      });
      refunded = true;
    }

    // The Solver's code was never judged, so the submission goes back in the
    // queue and the Giver can simply run the review again. Without this it
    // would stay SANDBOX_FAILED (a review can only be claimed from
    // AWAITING_REVIEW), the Giver would hold a refund they can't use, and the
    // Solver would have to burn one of their 3 attempts resubmitting for a
    // fault that was never theirs. Done in the same transaction as the refund,
    // so one can't happen without the other.
    if (refunded) {
      await tx.submission.updateMany({
        where: { id: submissionId, status: { in: ["SANDBOX_FAILED", "DEPENDENCY_INSTALL_FAILED"] } },
        data: { status: "AWAITING_REVIEW" },
      });
    }
    return refunded;
  });
}

/**
 * Claim + charge, then run the sandbox and record the evidence. If the run
 * ended because of the platform or the setup (outcome.refundable), the Giver
 * gets the review back: a platform failure must never eat a free review or
 * cost money. A program that ran and failed is a real result and stays charged.
 * `charged` in the return value is what the Giver is out of AFTER any refund.
 */
export async function startAndRunReview(submissionId: string, giverId: string) {
  const claim = await claimAndChargeReview(submissionId, giverId);
  const outcome = await runAndRecordSubmission(submissionId);

  let refunded = false;
  if (outcome.refundable) {
    try {
      refunded = await refundReview({
        giverId,
        problemId: claim.problemId,
        submissionId,
        charged: claim.charged,
      });
    } catch (error) {
      // The run result is already recorded; never lose it over a failed refund. Surface it for follow-up.
      console.error("Review refund failed:", submissionId, error instanceof Error ? error.message : "unknown error");
    }
  }
  return { charged: claim.charged && !refunded, refunded, problemId: claim.problemId, outcome };
}
