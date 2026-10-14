"use server";

import { after } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { mirrorSubmissionRepo } from "@/lib/github/mirror";
import { fetchBountiedManifest } from "@/lib/github/fetch-manifest";
import { checkDependencyPolicy, parseDependencyPolicy } from "@/lib/sandbox/bountied-manifest";
import { parseGithubRepoUrl } from "@/lib/github/repo-snapshot";
import { fetchCommitAvailability, fetchHeadCommitSha } from "@/lib/github/head-commit";
import { evaluateSubmitGate, shouldKeepPassed } from "@/lib/solver-tests/submit-gate";
import { submitGateDeps } from "@/lib/solver-tests/submit-gate-deps";
import { decryptGithubTokenOrNull } from "@/lib/security/github-token";

export type CreateSubmissionResult =
  | {
      error: string;
      /** Set when the error is the test gate: TEST_FAILED, TEST_ERROR, TEST_RUNNING or HEAD_UNVERIFIABLE. */
      code?: string;
      /** Set when the gate has a how-to-fix page for the failing test. */
      docsUrl?: string | null;
    }
  | { ok: true; submissionId: string };

export async function createSubmission(
  problemId: string,
  _prevState: CreateSubmissionResult | undefined,
  formData: FormData
): Promise<CreateSubmissionResult> {
  const repoUrlRaw = String(formData.get("repoUrl") ?? "").trim();
  const writeup = String(formData.get("writeup") ?? "").trim();
  const selectedCommitRaw = String(formData.get("selectedCommitSha") ?? "").trim();
  const selectedCommitSha = selectedCommitRaw || null;
  if (selectedCommitSha && !/^[0-9a-f]{40}$/.test(selectedCommitSha)) return { error: "Select a valid commit from the repository history." };

  if (!repoUrlRaw) {
    return { error: "Select a GitHub repository before submitting." };
  }

  // The form field is client-controlled and this URL later ends up in a shell
  // command and in GitHub API paths. Accept only https://github.com/<owner>/<repo>
  // and store it rebuilt from those two parts, so nothing else can ever be saved.
  const parsedRepo = parseGithubRepoUrl(repoUrlRaw);
  if (!parsedRepo) {
    return { error: "Select a GitHub repository (a plain https://github.com/owner/repo address) before submitting." };
  }
  const repoUrl = `https://github.com/${parsedRepo.owner}/${parsedRepo.repo}`;

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

  // Up to 3 attempts per solver per problem (product decision 2026-09-29).
  // Every prior attempt counts toward the cap, including failed/rejected
  // ones — this is a hard resubmission limit, not "3 successful reviews."
  // Each attempt is its own Submission row with its own independently
  // mirrored repo (repoNameForSubmission keys off submissionId, not
  // problemId+solverId — see lib/github/mirror.ts), so earlier attempts'
  // mirror/review history is never overwritten by a later one; a Giver
  // reviewing attempt 1 after the solver has already pushed attempt 3
  // still sees attempt 1's own real output, not attempt 3's.
  const MAX_SUBMISSION_ATTEMPTS = 3;
  const priorAttempts = await prisma.submission.count({
    where: { problemId, solverId: user.id },
  });

  if (priorAttempts >= MAX_SUBMISSION_ATTEMPTS) {
    return {
      error: `You've used all ${MAX_SUBMISSION_ATTEMPTS} submission attempts for this problem.`,
    };
  }

  const solverToken = decryptGithubTokenOrNull(user.githubAccessToken);
  if (!solverToken) return { error: "Reconnect GitHub before submitting." };
  let submissionCommitSha = selectedCommitSha;
  if (submissionCommitSha) {
    const available = await fetchCommitAvailability({ repoUrl, token: solverToken, commitSha: submissionCommitSha });
    if (!available.ok) return { error: available.reason ?? "The selected commit is no longer available. Refresh history and select another commit." };
  } else {
    // Pin even an untested submission to a single immutable snapshot now, not
    // whichever HEAD happens to exist when asynchronous mirroring starts.
    const head = await fetchHeadCommitSha({ repoUrl, token: solverToken });
    if (!head.ok || !head.commitSha) return { error: head.reason ?? "Could not determine the repository's current commit. Try again." };
    submissionCommitSha = head.commitSha;
  }

  // Solver-side test gate (see lib/solver-tests/submit-gate.ts). A commit whose
  // sandbox test FAILED or ERRORED can't be submitted; an untested repo can,
  // and is marked UNTESTED; PASSED is set only if the repo's HEAD right now is
  // the commit a passing test ran on. The test fields below come ONLY from this
  // server-side decision, never from the form.
  const gate = await evaluateSubmitGate(
    { solverId: user.id, problemId, repoUrl, solverToken: user.githubAccessToken ?? null, selectedCommitSha: submissionCommitSha },
    submitGateDeps
  );
  if (!gate.allow) {
    return { error: gate.message ?? "Your latest commit can't be submitted yet.", code: gate.code, docsUrl: gate.docsUrl ?? null };
  }

  const submission = await prisma.submission.create({
    data: {
      problemId,
      solverId: user.id,
      repoUrl,
      sourceCommitSha: submissionCommitSha ?? gate.testedCommitSha ?? null,
      writeup,
      status: "SUBMITTED",
      attemptNumber: priorAttempts + 1,
      testStatus: gate.testStatus,
      testedCommitSha: gate.testedCommitSha ?? null,
      testRunId: gate.testRunId ?? null,
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

    const solverToken = decryptGithubTokenOrNull(submission.solver.githubAccessToken);
    if (!solverToken) {
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
        solverToken,
      });

      if (!manifestFile.ok) {
        // Can't verify the policy because we couldn't even read the repo —
        // that's a real problem, but it's a CLONE-shaped problem, not a
        // policy violation. Let the normal mirror step below surface it
        // with its own (better) error message rather than duplicating it
        // here with a less specific one.
      } else {
        const check = checkDependencyPolicy(policy, manifestFile.content, submission.problem.runtime as "PYTHON" | "NODE");
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
      selectedCommitSha: submission.sourceCommitSha,
      solverToken,
      runtime: submission.problem.runtime,
      problemTitle: submission.problem.title,
      attemptNumber: submission.attemptNumber,
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

    // The mirror copies whatever the repo's HEAD is NOW. If this submission was
    // marked PASSED for an earlier commit and the Solver has pushed since, it
    // goes back to UNTESTED: PASSED always means "the code the Giver sees is the
    // code that passed".
    const keepPassed = shouldKeepPassed({
      testStatus: submission.testStatus,
      testedCommitSha: submission.testedCommitSha,
      mirroredCommitSha: mirrorResult.mirroredCommitSha,
    });

    // Mirror succeeded — repo is ready. Status becomes AWAITING_REVIEW so the
    // giver's ReviewButton becomes actionable. Sandbox has NOT run yet.
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        platformRepoUrl: mirrorResult.repo.cloneUrl,
        platformRepoFullName: mirrorResult.repo.fullName,
        status: "AWAITING_REVIEW",
        ...(keepPassed ? {} : { testStatus: "UNTESTED" as const, testedCommitSha: null, testRunId: null }),
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