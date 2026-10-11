import { fetchRepoSnapshot } from "@/lib/github/repo-snapshot";
import type { FetchLike } from "@/lib/github/repo-snapshot";
import { planRun } from "./planner";
import type { PlanRuntime, RunPlan } from "./planner";

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type PreflightResult = {
  /** False when GitHub couldn't be read at all (see reason). */
  ok: boolean;
  reason?: string;
  /** The exact commit that was analyzed. A real test must run this same commit. */
  commitSha?: string;
  /** What will run, or what to fix first. Check plan.ok before charging. */
  plan?: RunPlan;
};

/**
 * The free preflight: resolve the commit, read the repo through the GitHub API,
 * and plan the run. Costs nothing and boots no sandbox. The caller must pass the
 * SOLVER's own token (never the platform's) and a runtime taken from the
 * Problem row, never from the request.
 */
export async function runPreflight(params: {
  repoUrl: string;
  solverToken: string;
  runtime: PlanRuntime;
  fetchImpl?: FetchLike;
}): Promise<PreflightResult> {
  const snap = await fetchRepoSnapshot({
    repoUrl: params.repoUrl,
    token: params.solverToken,
    fetchImpl: params.fetchImpl,
  });
  if (!snap.ok) return { ok: false, reason: snap.reason };

  const plan = planRun({
    runtime: params.runtime,
    files: snap.files ?? [],
    bountiedJson: snap.bountiedJson ?? null,
    packageJson: snap.packageJson ?? null,
    requirementsTxt: snap.requirementsTxt ?? null,
  });
  return { ok: true, commitSha: snap.commitSha, plan };
}
