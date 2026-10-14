import { createHash } from "node:crypto";
import { parseGithubRepoUrl } from "@/lib/github/repo-snapshot";
import { checkDependencyPolicy, parseDependencyPolicy } from "@/lib/sandbox/bountied-manifest";
import { makeFinding, sandboxDocsUrl, sortFindings } from "./findings";
import type { Finding } from "./findings";
import type { PreflightResult } from "./preflight";
import type { RunPlan } from "./planner";
import type { BeginSolverTestResult, SolverTestErrorCode, SolverTestQuote } from "./service";

/**
 * Request handling for the Solver test routes, with every outside call (the
 * database, GitHub, the sandbox, the background scheduler) injected through
 * SolverTestDeps. That keeps the rules that matter here unit-testable without
 * Next, Prisma or E2B. The route files in app/api/solver-tests/ only parse the
 * request and call these.
 *
 * Trust rules (enforced here, tested in handlers.test.ts):
 *  - The Solver is ALWAYS the signed-in user. Nothing about identity is read from the body.
 *  - The token is the Solver's own, read from the server-side user record.
 *  - The runtime comes from the Problem row. The body's runtime, if any, is ignored.
 *  - The only things taken from the body are problemId, repoUrl (re-validated and rebuilt
 *    from owner/repo, so no query string or extra path survives) and an optional
 *    expectedCommitSha that can only make a run STOP, never change what runs.
 *  - Nothing is charged until the free preflight says the plan is runnable.
 *  - A run's output and diagnosis belong to its Solver. The status route returns a run
 *    only to its owner, and nothing here is reachable by a Giver (zero-source).
 */

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type HandlerResult = { status: number; body: Record<string, unknown> };

export type HandlerUser = { id: string; githubAccessToken?: string | null } | null;

export type ProblemForTest = {
  id: string;
  status: string;
  giverId: string;
  runtime: "PYTHON" | "NODE";
  dependencyPolicy: unknown;
};

export type RunRecord = {
  id: string;
  solverId: string;
  status: string;
  isFree: boolean;
  commitSha: string;
  mode: string | null;
  exitCode: number | null;
  output: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  refundedAt: Date | null;
  createdAt: Date;
  finishedAt: Date | null;
};

export type SolverTestDeps = {
  findProblem(problemId: string): Promise<ProblemForTest | null>;
  runPreflight(params: { repoUrl: string; solverToken: string; runtime: "PYTHON" | "NODE"; commitSha?: string }): Promise<PreflightResult>;
  getQuote(params: { solverId: string; problemId: string }): Promise<SolverTestQuote>;
  hasCachedPassedRun?(params: { solverId: string; problemId: string; repoUrl: string; commitSha: string; executionFingerprint: string }): Promise<boolean>;
  begin(params: { solverId: string; problemId: string; repoUrl: string; commitSha: string; executionFingerprint: string }): Promise<BeginSolverTestResult>;
  /** Runs a begun test and records how it ended. Must not throw for a normal failure. */
  execute(params: {
    runId: string;
    runtime: "PYTHON" | "NODE";
    repoUrl: string;
    solverToken: string;
    commitSha: string;
    plan: RunPlan;
  }): Promise<unknown>;
  /** Runs a task after the response has been sent (next/server `after`). */
  schedule(task: () => Promise<unknown>): void;
  findRun(runId: string): Promise<RunRecord | null>;
  /** Turns this Solver's stale RUNNING tests into refunded ERRORs. */
  reap(solverId: string): Promise<number>;
};

const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): HandlerResult => ({
  status,
  body: { error: message, code, ...extra },
});

const BEGIN_STATUS: Record<SolverTestErrorCode, number> = {
  NOT_FOUND: 404,
  NOT_OPEN: 409,
  OWN_PROBLEM: 403,
  ATTEMPTS_EXHAUSTED: 409,
  TOO_MANY_RUNNING: 429,
  INSUFFICIENT_FUNDS: 402,
  INVALID_COMMIT: 502,
};

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SHA = /^[0-9a-f]{40}$/;

type Prepared = {
  error?: HandlerResult;
  problem?: ProblemForTest;
  repoUrl?: string;
  solverToken?: string;
  preflight?: PreflightResult;
  plan?: RunPlan;
  body?: Record<string, unknown>;
};

/** Everything the preflight and run routes share. Costs nothing and boots no sandbox. */
async function prepare(user: HandlerUser, rawBody: unknown, deps: SolverTestDeps): Promise<Prepared> {
  if (!user) return { error: fail(401, "UNAUTHENTICATED", "Sign in to test your solution.") };
  if (!user.githubAccessToken) {
    return { error: fail(409, "GITHUB_NOT_CONNECTED", "Connect your GitHub account in Settings first.") };
  }

  const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? (rawBody as Record<string, unknown>) : null;
  const problemId = body && typeof body.problemId === "string" ? body.problemId : "";
  const repoRaw = body && typeof body.repoUrl === "string" ? body.repoUrl.trim() : "";
  if (!ID.test(problemId)) return { error: fail(400, "BAD_REQUEST", "Missing or invalid problemId.") };
  const target = parseGithubRepoUrl(repoRaw);
  if (!target) {
    return { error: fail(400, "BAD_REPO_URL", "Enter a GitHub repository URL like https://github.com/you/your-repo.") };
  }
  const repoUrl = `https://github.com/${target.owner}/${target.repo}`;
  const requestedCommit = body && typeof body.commitSha === "string" ? body.commitSha : undefined;
  if (requestedCommit !== undefined && !SHA.test(requestedCommit)) return { error: fail(400, "INVALID_COMMIT", "Select a valid commit from the history.") };

  const problem = await deps.findProblem(problemId);
  if (!problem) return { error: fail(404, "NOT_FOUND", "Problem not found.") };
  if (problem.status !== "OPEN") {
    return { error: fail(409, "NOT_OPEN", "This problem is no longer accepting submissions.") };
  }
  if (problem.giverId === user.id) {
    return { error: fail(403, "OWN_PROBLEM", "You can't test a solution on your own problem.") };
  }

  const preflight = await deps.runPreflight({
    repoUrl,
    solverToken: user.githubAccessToken,
    runtime: problem.runtime,
    ...(requestedCommit ? { commitSha: requestedCommit } : {}),
  });
  if (!preflight.ok || !preflight.plan || !preflight.commitSha) {
    return { error: fail(422, "REPO_UNREADABLE", preflight.reason ?? "Could not read your repository.") };
  }
  if (requestedCommit && preflight.commitSha !== requestedCommit) {
    return { error: fail(409, "COMMIT_UNAVAILABLE", "GitHub could not confirm the selected commit. Refresh history and choose an available commit.") };
  }

  const plan = applyDependencyPolicy(preflight, problem.dependencyPolicy, problem.runtime);
  return { problem, repoUrl, solverToken: user.githubAccessToken, preflight, plan, body: body as Record<string, unknown> };
}

/**
 * Holds the Solver to the Giver's dependency policy BEFORE they pay, the same
 * check mirroring applies after they submit. Otherwise a test could pass and the
 * submission still be rejected afterwards, which is the surprise this feature
 * exists to prevent. Never makes a plan more permissive.
 */
export function applyDependencyPolicy(preflight: PreflightResult, rawPolicy: unknown, runtime: "PYTHON" | "NODE" = "PYTHON"): RunPlan {
  const plan = preflight.plan as RunPlan;
  const policy = parseDependencyPolicy(rawPolicy);
  if (!policy) return plan;
  const check = checkDependencyPolicy(policy, preflight.bountiedJson ?? null, runtime);
  if (check.ok) return plan;
  const finding: Finding = makeFinding(
    "DEPENDENCY_POLICY",
    "error",
    check.reason as string,
    "Change the dependencies in bountied.json so they follow this bounty's rules, then check again."
  );
  return {
    ...plan,
    ok: false,
    effectiveManifest: null,
    findings: sortFindings([...plan.findings, finding]),
  };
}

/** What the browser needs. Deliberately leaves out the effective manifest. */
function planForClient(plan: RunPlan) {
  return {
    ok: plan.ok,
    mode: plan.mode,
    entrypoint: plan.entrypoint,
    addPytest: plan.addPytest,
    install: plan.install,
    findings: plan.findings,
  };
}

/** POST /api/solver-tests/preflight: free. Reads GitHub and plans the run; charges nothing. */
export async function handlePreflight(user: HandlerUser, rawBody: unknown, deps: SolverTestDeps): Promise<HandlerResult> {
  const p = await prepare(user, rawBody, deps);
  if (p.error) return p.error;
  const solverId = (user as { id: string }).id;
  const problem = p.problem as ProblemForTest;
  const commitSha = (p.preflight as PreflightResult).commitSha as string;
  const plan = p.plan as RunPlan;
  const executionFingerprint = createHash("sha256").update(JSON.stringify({ runtime: problem.runtime, mode: plan.mode, manifest: plan.effectiveManifest, entrypoint: plan.entrypoint, dependencyPolicy: problem.dependencyPolicy ?? null })).digest("hex");
  const cached = !!plan.ok && !!plan.effectiveManifest && !!deps.hasCachedPassedRun && await deps.hasCachedPassedRun({ solverId, problemId: problem.id, repoUrl: p.repoUrl as string, commitSha, executionFingerprint });
  const quote = await deps.getQuote({ solverId, problemId: problem.id });
  const effectiveQuote = cached ? { ...quote, costUsd: 0, free: true, canAfford: true, shortfallUsd: 0, cached: true } : quote;
  return {
    status: 200,
    body: { commitSha, plan: planForClient(plan), quote: effectiveQuote, cached },
  };
}

/**
 * POST /api/solver-tests/run: preflight again (the repo may have moved), refuse
 * to charge an unrunnable plan, charge and create the run, then return 202 and
 * run the sandbox after the response. The client polls the status route.
 */
export async function handleRun(user: HandlerUser, rawBody: unknown, deps: SolverTestDeps): Promise<HandlerResult> {
  const p = await prepare(user, rawBody, deps);
  if (p.error) return p.error;
  const solverId = (user as { id: string }).id;
  const problem = p.problem as ProblemForTest;
  const plan = p.plan as RunPlan;
  const commitSha = (p.preflight as PreflightResult).commitSha as string;
  const repoUrl = p.repoUrl as string;
  const solverToken = p.solverToken as string;

  if (!plan.ok || !plan.effectiveManifest) {
    return fail(422, "PLAN_NOT_RUNNABLE", "Fix the problems below before running a test. You have not been charged.", {
      plan: planForClient(plan),
    });
  }

  // The Solver saw a preflight for one commit. If they pushed since, stop instead of charging for a different one.
  const expected = (p.body as Record<string, unknown>).expectedCommitSha;
  const selected = (p.body as Record<string, unknown>).commitSha;
  if (expected !== undefined && (typeof expected !== "string" || !SHA.test(expected) || expected !== commitSha)) {
    return fail(409, "COMMIT_CHANGED", selected ? "The selected commit is no longer available or changed. Refresh the commit history and select an available commit." : "Your repository changed since the check. Check again to test the latest commit.", { commitSha });
  }

  const executionFingerprint = createHash("sha256").update(JSON.stringify({ runtime: problem.runtime, mode: plan.mode, manifest: plan.effectiveManifest, entrypoint: plan.entrypoint, dependencyPolicy: problem.dependencyPolicy ?? null })).digest("hex");
  const begun = await deps.begin({ solverId, problemId: problem.id, repoUrl, commitSha, executionFingerprint });
  if (!begun.ok || !begun.runId) {
    const code = (begun.code ?? "INVALID_COMMIT") as SolverTestErrorCode;
    return fail(BEGIN_STATUS[code] ?? 500, code, begun.message ?? "Could not start the test.", {
      requiredUsd: begun.requiredUsd,
      availableUsd: begun.availableUsd,
    });
  }

  const runId = begun.runId;
  if (!begun.reused) deps.schedule(async () => {
    try {
      await deps.execute({ runId, runtime: problem.runtime, repoUrl, solverToken, commitSha, plan });
    } catch (error) {
      // executeSolverTest completes the run itself. If even that failed, the reaper refunds it.
      console.error("Solver test task failed:", runId, error instanceof Error ? error.message : "unknown error");
    }
  });

  return {
    status: 202,
    body: {
      runId,
      commitSha,
      free: !!begun.isFree,
      reused: !!begun.reused,
      chargedUsd: Math.round(((begun.chargedFromCredit ?? 0) + (begun.chargedFromEarnings ?? 0)) * 100) / 100,
    },
  };
}

/** GET /api/solver-tests/[runId]: the owner's view of one run. Anyone else gets a 404. */
export async function handleStatus(user: HandlerUser, runId: string, deps: SolverTestDeps): Promise<HandlerResult> {
  if (!user) return fail(401, "UNAUTHENTICATED", "Sign in to see this test.");
  if (!ID.test(runId)) return fail(400, "BAD_REQUEST", "Invalid test id.");

  // A test whose server died should show as ERROR (refunded), not RUNNING forever.
  await deps.reap(user.id);

  const run = await deps.findRun(runId);
  if (!run || run.solverId !== user.id) return fail(404, "NOT_FOUND", "Test not found.");

  return {
    status: 200,
    body: {
      runId: run.id,
      status: run.status,
      free: run.isFree,
      commitSha: run.commitSha,
      mode: run.mode,
      exitCode: run.exitCode,
      output: run.output,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
      docsUrl: run.errorCode ? sandboxDocsUrl(run.errorCode) : null,
      refunded: run.refundedAt !== null,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
    },
  };
}
