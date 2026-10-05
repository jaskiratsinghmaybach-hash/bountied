import type { ExecutionResult } from "./execute";

/**
 * What a Giver is allowed to see from a sandbox evaluation BEFORE escrow
 * release. This is the explicit contract the review UI renders against —
 * not "whatever the process printed" (docs/review-engine-architecture.md §6).
 *
 * TRUST BOUNDARY: the platform chooses the command, but the command still
 * executes Solver-controlled code, so its stdout/stderr is UNTRUSTED DATA.
 * `output` is bounded and is NOT a sanitized or classified-safe channel: a
 * Solver's program can print arbitrary text (including its own source or
 * environment), and a test runner's own diagnostics can include source
 * snippets. Runtime adapters therefore prefer terse, traceback-free
 * invocations (see PYTHON_TEST_COMMAND in runtimes.ts), and structured
 * fields (status, exitCode) are the primary evidence. Do not widen what is
 * rendered from `output` without classifying it as safe first.
 *
 * `testSummary` (parsed pass/fail counts) is intentionally not implemented
 * yet: with no runtime parser it falls back to the bounded raw `output`.
 * If added, remember the counts are derived from Solver-controlled output.
 *
 * Storage: this maps onto the existing Submission.sandboxOutput /
 * sandboxExitCode / sandboxError columns (no schema churn) — what changed
 * is WHAT populates them: bounded output from a fixed platform command.
 */
export type ReviewEvidence = {
  exitCode: number | null;
  status: "passed" | "failed" | "error";
  /** Bounded; carries a "[truncated …]" marker when the cap is hit. Empty for "error". */
  output: string;
};

/** Cap for stored/shown evaluation output (stdout + stderr combined). */
export const EVIDENCE_OUTPUT_MAX_CHARS = 10_000;

function bound(text: string, max = EVIDENCE_OUTPUT_MAX_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n[output truncated — ${text.length - max} more characters]`;
}

export function buildReviewEvidence(result: ExecutionResult): ReviewEvidence {
  if (!result.ok) {
    // Never ran to completion (clone/install/infra). The human-readable
    // reason travels separately as sandboxError; no process output exists.
    return { exitCode: null, status: "error", output: "" };
  }
  const combined = result.stdout + (result.stderr ? "\n" + result.stderr : "");
  return {
    exitCode: result.exitCode,
    status: result.exitCode === 0 ? "passed" : "failed",
    output: bound(combined),
  };
}
