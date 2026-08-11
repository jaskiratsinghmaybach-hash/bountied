"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { grantGiverRepoAccess } from "./grant-access";
import { revalidatePath } from "next/cache";

export type RetryGrantResult = { ok: true } | { error: string };

/**
 * Retries the collaborator invite for an already-accepted submission.
 * Used when the automatic attempt in lib/escrow/release.ts didn't grant
 * access — most commonly because the giver hadn't connected GitHub
 * (no githubUsername on file) at the moment they clicked Accept & pay.
 *
 * Deliberately re-checks isRevealed and ownership rather than trusting
 * the caller — this must never be usable to grant repo access before
 * payment, or on someone else's problem.
 */
export async function retryGithubAccessGrant(
  submissionId: string
): Promise<RetryGrantResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do this." };

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { problem: true },
  });
  if (!submission) return { error: "Submission not found." };
  if (submission.problem.giverId !== user.id) {
    return { error: "Not authorized." };
  }
  if (!submission.isRevealed) {
    return { error: "This submission hasn't been accepted yet." };
  }
  if (submission.githubAccessGrantedAt) {
    return { ok: true }; // already done, nothing to retry
  }
  if (!submission.platformRepoFullName) {
    return {
      error: "This submission's repository hasn't finished importing yet — try again shortly.",
    };
  }

  const giver = await prisma.user.findUnique({
    where: { id: user.id },
    select: { githubUsername: true },
  });
  if (!giver?.githubUsername) {
    return { error: "Connect your GitHub account first." };
  }

  const grant = await grantGiverRepoAccess({
    platformRepoFullName: submission.platformRepoFullName,
    giverGithubUsername: giver.githubUsername,
  });

  if (!grant.ok) return { error: grant.reason };

  await prisma.submission.update({
    where: { id: submissionId },
    data: { githubAccessGrantedAt: new Date() },
  });

  revalidatePath(`/dashboard/giver/problems/${submission.problemId}`);
  return { ok: true };
}
