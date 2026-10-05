import { prisma } from "@/lib/db";
import { executeSubmission } from "@/lib/sandbox/execute";
import { buildReviewEvidence } from "@/lib/sandbox/review-evidence";

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type RunOutcome = {
  ok: boolean;
  submission?: Awaited<ReturnType<typeof prisma.submission.update>>;
  status?: number;
  error?: string;
};

/**
 * Runs the sandbox evaluation for a submission and records bounded review
 * evidence. Extracted verbatim from app/api/sandbox/run/route.ts so the web
 * route and /api/desktop/sandbox/run share ONE implementation of the
 * status mapping and evidence storage. AUTHORIZATION IS THE CALLER'S JOB.
 */
export async function runAndRecordSubmission(submissionId: string): Promise<RunOutcome> {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { problem: true },
    });
    if (!submission || !submission.platformRepoFullName || !submission.platformRepoUrl) {
      return { ok: false, status: 400, error: "Submission or mirrored repo not ready" };
    }

    await prisma.submission.update({ where: { id: submission.id }, data: { status: "RUNNING" } });

    const result = await executeSubmission({
      repoUrl: submission.platformRepoUrl,
      githubToken: process.env.PLATFORM_GITHUB_TOKEN || "",
      runtime: submission.problem.runtime,
    });

    const evidence = buildReviewEvidence(result);
    const isSuccess = result.ok && result.exitCode === 0;
    // Cast: this repo runs `strict: false`, where the ok/!ok union doesn't narrow.
    const failure = result.ok ? null : (result as { kind: string; reason: string });
    const failureStatus =
      failure?.kind === "dependency-install" ? "DEPENDENCY_INSTALL_FAILED" : "SANDBOX_FAILED";

    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        sandboxOutput: result.ok ? evidence.output : null,
        sandboxExitCode: evidence.exitCode,
        sandboxError: failure ? failure.reason : null,
        sandboxRanAt: new Date(),
        status: isSuccess ? "UNDER_REVIEW" : failureStatus,
      },
    });
    return { ok: true, submission: updated };
  } catch (error) {
    console.error("Sandbox execution error:", error);
    await prisma.submission
      .update({
        where: { id: submissionId },
        data: {
          status: "SANDBOX_FAILED",
          sandboxError: `Sandbox execution failed: ${error instanceof Error ? error.message : String(error)}`,
          sandboxRanAt: new Date(),
        },
      })
      .catch(() => {});
    return { ok: false, status: 500, error: "Sandbox execution failed" };
  }
}
