import type { Runtime } from "@prisma/client";
import { executeSubmission } from "@/lib/sandbox/execute";
import { outcomeFromExecution } from "./outcome";
import type { RunPlan } from "./planner";
import { completeSolverTest } from "./service";
import type { CompleteSolverTestResult, SolverTestOutcome } from "./service";

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type SolverTestRunResult = {
  outcome: SolverTestOutcome;
  completion: CompleteSolverTestResult;
};

/**
 * Runs ONE already-begun Solver test (beginSolverTest has charged it and
 * created the RUNNING row) and records how it ended. Deliberately not a
 * "use server" file. AUTHORIZATION AND BILLING ARE THE CALLER'S JOB: the route
 * must have authenticated the Solver from the session, taken runtime and
 * repoUrl from the Problem and the Solver's own record, and called
 * beginSolverTest first.
 *
 * Whatever happens here, the run is completed, so a thrown error becomes a
 * refunded ERROR instead of a RUNNING row that holds the Solver's quota until
 * the reaper finds it.
 *
 * `solverToken` is the SOLVER's read-only token, never the platform's.
 */
export async function executeSolverTest(params: {
  runId: string;
  runtime: Runtime;
  repoUrl: string;
  solverToken: string;
  /** The exact commit beginSolverTest was given. */
  commitSha: string;
  /** From runPreflight. Must be ok, with an effective manifest. */
  plan: RunPlan;
}): Promise<SolverTestRunResult> {
  const { runId, runtime, repoUrl, solverToken, commitSha, plan } = params;
  const mode = plan.mode;
  const planRuntime = runtime as "PYTHON" | "NODE";

  let outcome: SolverTestOutcome;
  if (!plan.ok || !plan.effectiveManifest) {
    outcome = outcomeFromExecution({
      result: { ok: false, kind: "setup", reason: "The preflight plan was not runnable." },
      runtime: planRuntime,
      mode,
    });
  } else {
    try {
      const result = await executeSubmission({
        runtime,
        repoUrl,
        githubToken: solverToken,
        expectedCommitSha: commitSha,
        manifest: plan.effectiveManifest,
      });
      outcome = outcomeFromExecution({ result, runtime: planRuntime, mode, expectedCommitSha: commitSha });
    } catch (error) {
      console.error("Solver test crashed:", error instanceof Error ? error.message : "unknown error");
      outcome = outcomeFromExecution({
        result: { ok: false, kind: "infra", reason: "The runner crashed." },
        runtime: planRuntime,
        mode,
      });
    }
  }

  const completion = await completeSolverTest(runId, outcome);
  return { outcome, completion };
}
