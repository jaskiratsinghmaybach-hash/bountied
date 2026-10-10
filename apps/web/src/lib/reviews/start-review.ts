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

/** Claim + charge, then run the sandbox and record the evidence. */
export async function startAndRunReview(submissionId: string, giverId: string) {
  const { charged, problemId } = await claimAndChargeReview(submissionId, giverId);
  const outcome = await runAndRecordSubmission(submissionId);
  return { charged, problemId, outcome };
}
