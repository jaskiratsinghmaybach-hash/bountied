import { prisma } from "@/lib/db";
import { executeSubmission } from "@/lib/sandbox/execute";
import { buildReviewEvidence } from "@/lib/sandbox/review-evidence";
import { diagnose } from "@/lib/solver-tests/diagnose";
import { giverSafeReason } from "@/lib/sandbox/giver-reason";

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type RunOutcome = {
  ok: boolean;
  submission?: Awaited<ReturnType<typeof prisma.submission.update>>;
  status?: number;
  error?: string;
  /**
   * True when the run ended because of the platform or the setup, not because
   * of the Solver's code (see diagnose.ts). The Giver must then be refunded
   * (lib/reviews/start-review.ts). A program that ran and failed is NOT refundable.
   */
  refundable?: boolean;
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

    // Only `refundable` is taken from the diagnosis. Its text is for the Solver and never reaches a Giver.
    const refundable = failure
      ? diagnose({
          runtime: submission.problem.runtime as "PYTHON" | "NODE",
          mode: null,
          failureKind: failure.kind as "clone" | "dependency-install" | "infra" | "setup" | "timeout",
          output: (result as { output?: string }).output ?? failure.reason,
        })?.refundable === true
      : false;

    if (failure) {
      console.error("Review sandbox run failed:", submission.id, failure.kind, failure.reason);
    }

    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        sandboxOutput: result.ok ? evidence.output : null,
        sandboxExitCode: evidence.exitCode,
        // Zero-source: the Giver sees a fixed sentence, never the runner's raw reason
        // (it can echo the Solver's files). The raw reason is logged below.
        sandboxError: failure ? giverSafeReason(failure.kind) : null,
        sandboxRanAt: new Date(),
        status: isSuccess ? "UNDER_REVIEW" : failureStatus,
      },
    });
    return { ok: true, submission: updated, refundable };
  } catch (error) {
    console.error("Sandbox execution error:", error);
    await prisma.submission
      .update({
        where: { id: submissionId },
        data: {
          status: "SANDBOX_FAILED",
          // Fixed text for the same reason as above; the real error is in the server log (console.error above).
          sandboxError: giverSafeReason("infra"),
          sandboxRanAt: new Date(),
        },
      })
      .catch(() => {});
    return { ok: false, status: 500, error: "Sandbox execution failed", refundable: true };
  }
}
