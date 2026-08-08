import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { executeSubmission } from "@/lib/sandbox/execute";
import { mirrorSubmissionRepo } from "@/lib/github/mirror";

/**
 * Internal route — called fire-and-forget by lib/problems/submission-actions.ts
 * immediately after a Submission row is created. It does two things, in order:
 *
 *   1. Mirrors the solver's repo into the platform's GitHub account
 *      (github.com/bountied-repositories) as a standalone PRIVATE repo.
 *   2. Runs THAT mirror in an E2B sandbox and writes the result back.
 *
 * Step 2 deliberately uses the platform mirror and the platform token, not
 * the solver's repo and token: once the code is imported, the solver's
 * credentials are no longer needed, and execution is reproducible even if
 * the solver later deletes their repo or revokes our access mid-review.
 *
 * This is a server-to-server call, NOT called from the browser. It's
 * authenticated by a shared secret (SANDBOX_INTERNAL_SECRET) rather than a
 * user session, so arbitrary browsers can't trigger sandbox runs directly.
 *
 * Long-running (mirror up to ~120s + execution up to ~40s) so the submission
 * creation action doesn't await it — the solver sees "Running..." throughout.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  // Verify this came from our own server, not an arbitrary browser request.
  const secret = request.headers.get("x-sandbox-secret");
  if (secret !== process.env.SANDBOX_INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { submissionId } = body as { submissionId: string };

  if (!submissionId) {
    return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { problem: true },
  });

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (submission.status !== "RUNNING") {
    return NextResponse.json({ error: "Submission is not in RUNNING state" }, { status: 409 });
  }

  const solver = await prisma.user.findUnique({
    where: { id: submission.solverId },
    select: { githubAccessToken: true, githubConnected: true },
  });

  if (!solver?.githubAccessToken || !solver.githubConnected) {
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: "SANDBOX_FAILED",
        sandboxError: "No GitHub token on file — solver needs to reconnect GitHub.",
      },
    });
    return NextResponse.json({ error: "No GitHub token" }, { status: 422 });
  }

  const platformToken = process.env.PLATFORM_GITHUB_TOKEN;
  if (!platformToken) {
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: "SANDBOX_FAILED",
        sandboxError:
          "The platform is not configured to import repositories right now. This is a platform issue, not a problem with your submission — please try again shortly.",
        sandboxRanAt: new Date(),
      },
    });
    return NextResponse.json({ error: "PLATFORM_GITHUB_TOKEN not configured" }, { status: 500 });
  }

  // 1. Import the solver's code into the platform account. Uses the SOLVER's
  //    token to read (their repo may be private) and the PLATFORM's token to
  //    create + push. The new repo is private; it becomes public only on
  //    escrow release.
  //
  //    Reuse an existing mirror if this submission was already imported by a
  //    previous attempt, so a retry doesn't re-clone the whole history.
  let platformRepoUrl = submission.platformRepoUrl;
  if (!platformRepoUrl) {
    const mirror = await mirrorSubmissionRepo({
      submissionId,
      sourceRepoUrl: submission.repoUrl,
      solverToken: solver.githubAccessToken,
      runtime: submission.problem.runtime,
      problemTitle: submission.problem.title,
    });

    if (!mirror.ok) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: "SANDBOX_FAILED",
          sandboxError: mirror.reason,
          sandboxRanAt: new Date(),
        },
      });
      return NextResponse.json({ error: "Mirror failed" }, { status: 422 });
    }

    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        platformRepoUrl: mirror.repo.htmlUrl,
        platformRepoFullName: mirror.repo.fullName,
        platformRepoPublic: false,
      },
    });
    platformRepoUrl = mirror.repo.htmlUrl;
  }

  // 2. Execute the PLATFORM's copy, with the PLATFORM's token — the solver's
  //    token is not used past the mirror step above.
  const result = await executeSubmission({
    runtime: submission.problem.runtime,
    runCommand: submission.problem.runCommand,
    repoUrl: platformRepoUrl,
    githubToken: platformToken,
  });

  if (result.ok) {
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: "UNDER_REVIEW",
        sandboxOutput: `STDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr}`,
        sandboxExitCode: result.exitCode,
        sandboxRanAt: new Date(),
      },
    });
  } else {
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: "SANDBOX_FAILED",
        sandboxError: result.reason,
        sandboxRanAt: new Date(),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
