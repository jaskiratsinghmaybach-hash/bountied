import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { executeSubmission } from "@/lib/sandbox/execute";

/**
 * Internal route — called fire-and-forget by lib/problems/submission-actions.ts
 * immediately after a Submission row is created. Runs the solver's repo in
 * an E2B sandbox and writes the result back to the Submission row.
 *
 * This is a server-to-server call, NOT called from the browser. It's
 * authenticated by a shared secret (SANDBOX_INTERNAL_SECRET) rather than a
 * user session, so arbitrary browsers can't trigger sandbox runs directly.
 *
 * Long-running (up to ~40 seconds total with timeout + overhead) so the
 * submission creation action doesn't await it — the solver sees "Running..."
 * while this completes in the background.
 */
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

  const result = await executeSubmission({
    runtime: submission.problem.runtime,
    runCommand: submission.problem.runCommand,
    repoUrl: submission.repoUrl,
    githubToken: solver.githubAccessToken,
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
