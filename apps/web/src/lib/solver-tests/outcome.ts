import type { ExecutionResult } from "@/lib/sandbox/execute";
import { diagnose } from "./diagnose";
import type { SolverTestOutcome } from "./service";

/**
 * Turns what the sandbox runner reported into the SolverTestOutcome that
 * completeSolverTest records. Pure, so every mapping is unit-tested.
 *
 *   exit 0                      -> PASSED
 *   ran, exited non-zero        -> FAILED  (diagnosed from the program's output)
 *   install failed (Solver's)   -> FAILED  (charged)
 *   timeout                     -> FAILED  (charged)
 *   infra / clone / setup, or a network problem while installing
 *                               -> ERROR   (always refunded, never uses the free test)
 *
 * What is stored for the Solver is the diagnosis text (code, title and hint),
 * never the runner's raw `reason`. All of it belongs to the Solver and must
 * never reach a Giver (zero-source).
 *
 * Defense in depth: when the caller says which commit the test is for, a result
 * from any other commit is recorded as ERROR, not as a pass or a fail of the
 * wrong code.
 */
export function outcomeFromExecution(params: {
  result: ExecutionResult;
  runtime: "PYTHON" | "NODE";
  mode: "tests" | "entry" | null;
  expectedCommitSha?: string;
}): SolverTestOutcome {
  const { result, runtime, mode, expectedCommitSha } = params;

  if (expectedCommitSha && result.ok && result.commitSha !== expectedCommitSha) {
    return errorOutcome(
      mode,
      "SETUP_PROBLEM",
      "Your repository couldn't be set up",
      "The code that ran was not the commit you asked to test. You were not charged. Test again."
    );
  }

  if (!result.ok) {
    const d = diagnose({
      runtime,
      mode,
      failureKind: result.kind ?? "infra",
      output: result.output ?? result.reason ?? "",
    });
    // diagnose only returns null for exit 0, which cannot happen for a failure; fail safe as a platform error.
    if (!d) return errorOutcome(mode, "PLATFORM_ERROR", "Bountied had a problem", "You were not charged. Try again in a minute.");
    return {
      status: d.status,
      mode,
      exitCode: null,
      // A failed install's output helps the Solver fix their dependencies. An ERROR has nothing of theirs to show.
      output: d.status === "FAILED" && result.output ? result.output : null,
      errorCode: d.code,
      errorMessage: `${d.title}. ${d.hint}`,
    };
  }

  const combined = (result.stdout ?? "") + (result.stderr ? "\n" + result.stderr : "");
  if (result.exitCode === 0) {
    return { status: "PASSED", mode, exitCode: 0, output: combined, errorCode: null, errorMessage: null };
  }

  const d = diagnose({ runtime, mode, exitCode: result.exitCode ?? null, output: combined });
  if (!d) return errorOutcome(mode, "PLATFORM_ERROR", "Bountied had a problem", "You were not charged. Try again in a minute.");
  return {
    status: d.status,
    mode,
    exitCode: result.exitCode ?? null,
    output: combined,
    errorCode: d.code,
    errorMessage: `${d.title}. ${d.hint}`,
  };
}

function errorOutcome(mode: string | null, code: string, title: string, hint: string): SolverTestOutcome {
  return { status: "ERROR", mode, exitCode: null, output: null, errorCode: code, errorMessage: `${title}. ${hint}` };
}
