"use server";

import { after } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { mirrorSubmissionRepo } from "@/lib/github/mirror";

export type CreateSubmissionResult =
  | { error: string }
  | { ok: true; submissionId: string };

export async function createSubmission(
  problemId: string,
  _prevState: CreateSubmissionResult | undefined,
  formData: FormData
): Promise<CreateSubmissionResult> {
  const repoUrl = String(formData.get("repoUrl") ?? "").trim();
  const writeup = String(formData.get("writeup") ?? "").trim();

  if (!repoUrl) {
    return { error: "Select a GitHub repository before submitting." };
  }

  if (writeup.length < 30) {
    return { error: "Writeup must be at least 30 characters long." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be logged in to submit." };
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, status: true },
  });

  if (!problem) {
    return { error: "Problem not found." };
  }

  if (problem.status !== "OPEN") {
    return { error: "This problem is no longer accepting submissions." };
  }

  const existingSubmission = await prisma.submission.findFirst({
    where: { problemId, solverId: user.id },
    select: { id: true },
  });

  if (existingSubmission) {
    return { error: "You already submitted a solution for this problem." };
  }

  const submission = await prisma.submission.create({
    data: {
      problemId,
      solverId: user.id,
      repoUrl,
      writeup,
      status: "SUBMITTED",
    },
  });

  // Mirror the repo eagerly so it's ready before any giver-triggered review.
  // Sandbox execution is intentionally NOT called here — it only runs when
  // the giver clicks ReviewButton (billing is enforced there via triggerSubmissionReview).
  after(async () => {
    await mirrorOnly(submission.id);
  });

  revalidatePath("/dashboard/solver/submissions");
  return { ok: true, submissionId: submission.id };
}

async function mirrorOnly(submissionId: string) {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { problem: true, solver: true },
    });

    if (!submission) return;

    if (!submission.solver.githubAccessToken) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: "SANDBOX_FAILED",
          sandboxError:
            "GitHub account not connected. Connect your GitHub account in Settings before submitting.",
        },
      });
      return;
    }

    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "RUNNING" },
    });

    const mirrorResult = await mirrorSubmissionRepo({
      submissionId,
      sourceRepoUrl: submission.repoUrl,
      solverToken: submission.solver.githubAccessToken,
      runtime: submission.problem.runtime,
      problemTitle: submission.problem.title,
    });

    if (!mirrorResult.ok) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: "SANDBOX_FAILED",
          sandboxError: `Repository mirror failed: ${mirrorResult.reason}`,
        },
      });
      return;
    }

    // Mirror succeeded — repo is ready. Status becomes AWAITING_REVIEW so the
    // giver's ReviewButton becomes actionable. Sandbox has NOT run yet.
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        platformRepoUrl: mirrorResult.repo.cloneUrl,
        platformRepoFullName: mirrorResult.repo.fullName,
        status: "AWAITING_REVIEW",
      },
    });
  } catch (err) {
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: "SANDBOX_FAILED",
        sandboxError: `Mirror failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    }).catch(() => {});
  }
}
