"use server";

import { after } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { mirrorSubmissionRepo } from "@/lib/github/mirror";
import { fetchBountiedManifest } from "@/lib/github/fetch-manifest";
import { checkDependencyPolicy, parseDependencyPolicy } from "@/lib/sandbox/bountied-manifest";

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

    // Dependency policy check (product decision 2026-09-02) — runs BEFORE
    // any sandbox boots. If the Giver set Problem.dependencyPolicy and the
    // solver's bountied.json violates it, reject here for the cost of
    // one GitHub API call, not a mirror boot + an eventual execute boot.
    // No policy set (the common case) = zero extra calls, this resolves
    // instantly to ok:true with an empty policy.
    const policy = parseDependencyPolicy(submission.problem.dependencyPolicy);
    if (policy) {
      const manifestFile = await fetchBountiedManifest({
        repoUrl: submission.repoUrl,
        solverToken: submission.solver.githubAccessToken,
      });

      if (!manifestFile.ok) {
        // Can't verify the policy because we couldn't even read the repo —
        // that's a real problem, but it's a CLONE-shaped problem, not a
        // policy violation. Let the normal mirror step below surface it
        // with its own (better) error message rather than duplicating it
        // here with a less specific one.
      } else {
        const check = checkDependencyPolicy(policy, manifestFile.content);
        if (!check.ok) {
          await prisma.submission.update({
            where: { id: submissionId },
            data: {
              status: "DEPENDENCY_POLICY_VIOLATION",
              sandboxError: check.reason,
            },
          });
          return;
        }
      }
    }

    // MIRRORING, not RUNNING — this step clones/mirrors the solver's repo
    // and costs nothing. RUNNING is reserved for the paid E2B sandbox
    // step in api/sandbox/run/route.ts, which only starts once the Giver
    // clicks "Run sandbox review" — see MIRRORING's doc comment in
    // schema.prisma for why these used to share one status and what that
    // broke on the review card.
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "MIRRORING" },
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