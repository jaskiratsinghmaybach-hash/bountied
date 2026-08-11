import { EscrowState, SubmissionStatus, ProblemStatus } from "@prisma/client";
import { amountCreditedOnRelease } from "@/lib/payments/fees";
import { grantGiverRepoAccess } from "@/lib/github/grant-access";
import { prisma } from "@/lib/db";

/**
 * THE core trust guarantee of the platform:
 *
 *   Submission.isRevealed must ONLY ever become true here, as a side effect
 *   of Escrow.state actually becoming RELEASED after funds are credited to
 *   the solver.
 *
 * Every place that serves submission code to a problem-giver (the
 * platformRepoUrl link on the giver detail page, for example) must check
 * isRevealed server-side and refuse to serve real repo access if false. Never
 * trust a client-supplied "I paid" flag. Never let a UI button flip
 * isRevealed directly.
 *
 * This function is intentionally the ONLY writer of:
 *   - Escrow.state -> RELEASED
 *   - Submission.isRevealed -> true
 *   - Submission.status -> ACCEPTED / REJECTED
 *   - Submission.githubAccessGrantedAt -> set (the GitHub-side reveal — a
 *     specific collaborator invite to the specific giver who paid, NOT a
 *     public/private flip; see lib/github/grant-access.ts. A mirror repo
 *     is never made public — its name is derivable from a visible
 *     submission id, so "public" would mean world-readable, not
 *     giver-readable.)
 *   - Problem.status -> COMPLETED
 * so there is exactly one code path to audit for the money-moves-code-unlocks
 * guarantee.
 *
 * NOTE on the fee model: release does NOT call any payment provider —
 * escrow is platform-held credit, not a live bank transfer per problem, so
 * "releasing" it means crediting the solver's internal availableBalance at
 * 95% of the bounty (the platform's first 5% cut — see
 * lib/payments/fees.ts). The actual bank transfer happens later and is
 * fully manual in v1: the solver requests a withdrawal (see
 * lib/payouts/withdraw.ts), which creates a PayoutRequest that the
 * platform admin transfers by hand via Wise — see /admin/payouts.
 */
export async function acceptSubmissionAndRelease(params: {
  problemId: string;
  submissionId: string;
  actingGiverId: string; // for authorization check — must equal Problem.giverId
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { problemId, submissionId, actingGiverId } = params;

  const outcome: { ok: true; platformRepoFullName: string | null } | { ok: false; reason: string } =
    await prisma.$transaction(async (tx) => {
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

    const bountyAmount = Number(problem.escrow.amount);
    const creditedAmount = amountCreditedOnRelease(bountyAmount); // bounty * 0.95

    // 1. Flip the reveal gate.
    await tx.submission.update({
      where: { id: submissionId },
      data: { status: SubmissionStatus.ACCEPTED, isRevealed: true },
    });

    // 2. Reject every other submission on this problem.
    await tx.submission.updateMany({
      where: { problemId, id: { not: submissionId } },
      data: { status: SubmissionStatus.REJECTED },
    });

    // 3. Release escrow record. paymentProviderRef stays null here — no
    //    external payout happened yet, only an internal balance credit.
    await tx.escrow.update({
      where: { id: problem.escrow.id },
      data: {
        state: EscrowState.RELEASED,
        releasedAt: new Date(),
        releasedToSubmissionId: submissionId,
      },
    });

    // 4. Close out the problem.
    await tx.problem.update({
      where: { id: problemId },
      data: { status: ProblemStatus.COMPLETED, completedAt: new Date() },
    });

    // 5. Credit the solver: availableBalance (withdrawable now) at 95%,
    //    totalEarned (lifetime stat, always the full bounty) unchanged.
    await tx.user.update({
      where: { id: submission.solverId },
      data: {
        completionCount: { increment: 1 },
        totalEarned: { increment: bountyAmount },
        availableBalance: { increment: creditedAmount },
      },
    });

    return { ok: true, platformRepoFullName: submission.platformRepoFullName };
  });

  if (!outcome.ok) return outcome;

  // Invite the giver as a collaborator on the platform mirror — the
  // actual code reveal.
  //
  // Deliberately OUTSIDE the transaction: this is a network round-trip to
  // GitHub, and holding a DB transaction open across it would pin a
  // connection for seconds and risk a transaction timeout rolling back a
  // payment that already succeeded.
  //
  // Ordering is money-first, reveal-second on purpose. If this call fails
  // — most often because the giver hasn't connected GitHub yet, so there
  // is no githubUsername to invite — the payment stands and isRevealed
  // stays true; we never claw back a release. githubAccessGrantedAt
  // simply stays null and the giver's page offers a retry once they've
  // connected GitHub. The reverse order would risk granting access to
  // code the giver never paid for.
  if (outcome.platformRepoFullName) {
    const giver = await prisma.user.findUnique({
      where: { id: actingGiverId },
      select: { githubUsername: true },
    });

    if (giver?.githubUsername) {
      const grant = await grantGiverRepoAccess({
        platformRepoFullName: outcome.platformRepoFullName,
        giverGithubUsername: giver.githubUsername,
      });
      if (grant.ok) {
        await prisma.submission.update({
          where: { id: submissionId },
          data: { githubAccessGrantedAt: new Date() },
        });
      } else {
        console.error(`[github-access] submission ${submissionId}: ${grant.reason}`);
      }
    } else {
      console.error(
        `[github-access] submission ${submissionId}: giver ${actingGiverId} has no GitHub username on file yet — retry once they connect GitHub`
      );
    }
  }

  return { ok: true };
}