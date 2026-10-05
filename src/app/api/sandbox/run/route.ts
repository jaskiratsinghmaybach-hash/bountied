import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { executeSubmission } from "@/lib/sandbox/execute";
import { buildReviewEvidence } from "@/lib/sandbox/review-evidence";

export async function POST(req: Request) {
  let submissionId: string | undefined;
  try {
    const body = await req.json();
    submissionId = body.submissionId;

    if (!submissionId) {
      return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { problem: true },
    });

    if (!submission || !submission.platformRepoFullName || !submission.platformRepoUrl) {
      return NextResponse.json(
        { error: "Submission or mirrored repo not ready" },
        { status: 400 }
      );
    }

    // Update status to RUNNING
    await prisma.submission.update({
      where: { id: submission.id },
      data: { status: "RUNNING" },
    });

    // Execute code in E2B sandbox
    const result = await executeSubmission({
      repoUrl: submission.platformRepoUrl,
      githubToken: process.env.PLATFORM_GITHUB_TOKEN || "",
      runtime: submission.problem.runtime,
    });

    // Save bounded review evidence (lib/sandbox/review-evidence.ts). The
    // evaluation command was built by the runtime adapter from the Solver's
    // validated bountied.json — Problem.runCommand is no longer read.
    const evidence = buildReviewEvidence(result);
    const isSuccess = result.ok && result.exitCode === 0;
    // Failure status mapping (product decision 2026-09-02): a dependency
    // install failure gets its own status distinct from clone/infra
    // failures, so a giver reviewing a failed submission can tell "the
    // solver's environment didn't build" from "our infra broke" instead of
    // both collapsing into one opaque SANDBOX_FAILED bucket. Clone and
    // infra failures intentionally stay SANDBOX_FAILED, unchanged.
    const failureStatus =
      !result.ok && result.kind === "dependency-install"
        ? "DEPENDENCY_INSTALL_FAILED"
        : "SANDBOX_FAILED";

    const updatedSubmission = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        sandboxOutput: result.ok ? evidence.output : null,
        sandboxExitCode: evidence.exitCode,
        sandboxError: result.ok ? null : result.reason,
        sandboxRanAt: new Date(),
        status: isSuccess ? "UNDER_REVIEW" : failureStatus,
      },
    });

    return NextResponse.json({ success: true, submission: updatedSubmission });
  } catch (error) {
    console.error("Sandbox execution error:", error);
    if (submissionId) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: "SANDBOX_FAILED",
          sandboxError: `Sandbox execution failed: ${error instanceof Error ? error.message : String(error)}`,
          sandboxRanAt: new Date(),
        },
      }).catch(() => {});
    }
    return NextResponse.json(
      { error: "Sandbox execution failed" },
      { status: 500 }
    );
  }
}