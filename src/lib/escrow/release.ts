import { EscrowState, SubmissionStatus, ProblemStatus } from "@prisma/client";
import { getPaymentProvider } from "@/lib/payments";
import { prisma } from "@/lib/db";

/**
 * THE core trust guarantee of the platform:
 *
 *   Submission.isRevealed must ONLY ever become true here, as a side effect
 *   of Escrow.state actually becoming RELEASED after a successful payout.
 *
 * Every place that serves submission code to a problem-giver (the API route
 * that streams codeBlobUrl, for example) must check isRevealed server-side
 * and refuse to serve the real code if false. Never trust a client-supplied
 * "I paid" flag. Never let a UI button flip isRevealed directly.
 *
 * This function is intentionally the ONLY writer of:
 *   - Escrow.state -> RELEASED
 *   - Submission.isRevealed -> true
 *   - Submission.status -> ACCEPTED / REJECTED
 *   - Problem.status -> COMPLETED
 * so there is exactly one code path to audit for the money-moves-code-unlocks
 * guarantee.
 */
export async function acceptSubmissionAndRelease(params: {
  problemId: string;
  submissionId: string;
  actingGiverId: string; // for authorization check — must equal Problem.giverId
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { problemId, submissionId, actingGiverId } = params;

  return prisma.$transaction(async (tx) => {
    const problem = await tx.problem.findUnique({
      where: { id: problemId },
      include: { escrow: true },
    });

    if (!problem) return { ok: false, reason: "Problem not found" };
    if (problem.giverId !== actingGiverId) {
      return { ok: false, reason: "Only the problem giver can accept a submission" };
    }
    if (!problem.escrow || problem.escrow.state !== EscrowState.HELD) {
      return { ok: false, reason: "Escrow is not in a releasable state" };
    }

    const submission = await tx.submission.findUnique({ where: { id: submissionId } });
    if (!submission || submission.problemId !== problemId) {
      return { ok: false, reason: "Submission not found for this problem" };
    }
    if (submission.isRevealed) {
      return { ok: false, reason: "Submission already revealed/paid" };
    }

    // 1. Call out to the payment provider FIRST — do not flip any DB state
    //    until money has actually moved. If this throws, the transaction
    //    rolls back and nothing changes.
    const provider = getPaymentProvider();
    const payout = await provider.payoutToSolver({
      solverId: submission.solverId,
      amount: Number(problem.escrow.amount),
      currency: problem.escrow.currency,
      escrowId: problem.escrow.id,
    });

    if (payout.status !== "succeeded") {
      return { ok: false, reason: `Payout did not succeed: ${payout.status}` };
    }

    // 2. Only now do we flip the reveal gate.
    await tx.submission.update({
      where: { id: submissionId },
      data: { status: SubmissionStatus.ACCEPTED, isRevealed: true },
    });

    // 3. Reject every other submission on this problem.
    await tx.submission.updateMany({
      where: { problemId, id: { not: submissionId } },
      data: { status: SubmissionStatus.REJECTED },
    });

    // 4. Release escrow record.
    await tx.escrow.update({
      where: { id: problem.escrow.id },
      data: {
        state: EscrowState.RELEASED,
        releasedAt: new Date(),
        releasedToSubmissionId: submissionId,
        paymentProviderRef: payout.providerRef,
      },
    });

    // 5. Close out the problem.
    await tx.problem.update({
      where: { id: problemId },
      data: { status: ProblemStatus.COMPLETED, completedAt: new Date() },
    });

    // 6. Bump solver stats. (Rating/badges recalculation can hook in here later.)
    await tx.user.update({
      where: { id: submission.solverId },
      data: {
        completionCount: { increment: 1 },
        totalEarned: { increment: problem.escrow.amount },
      },
    });

    return { ok: true };
  });
}
