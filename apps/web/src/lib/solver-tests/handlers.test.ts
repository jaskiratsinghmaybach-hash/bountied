import { describe, expect, it, vi } from "vitest";
import { applyDependencyPolicy, handlePreflight, handleRun, handleStatus } from "./handlers";
import type { ProblemForTest, RunRecord, SolverTestDeps } from "./handlers";
import type { PreflightResult } from "./preflight";
import type { RunPlan } from "./planner";
import { makeFinding } from "./findings";

const SHA = "a".repeat(40);
const USER = { id: "solver1", githubAccessToken: "gho_solver_token" };
const GOOD_BODY = { problemId: "prob1", repoUrl: "https://github.com/solver1/project" };

const okPlan: RunPlan = {
  ok: true,
  mode: "tests",
  entrypoint: null,
  addPytest: true,
  install: true,
  effectiveManifest: { dependencies: [{ name: "pytest", version: null }], executionMode: "test" },
  findings: [makeFinding("PLAN", "info", "Will run your tests with pytest.", "Run the test to see the result.")],
};
const badPlan: RunPlan = {
  ok: false,
  mode: null,
  entrypoint: null,
  addPytest: false,
  install: false,
  effectiveManifest: null,
  findings: [makeFinding("NO_TESTS", "error", "No tests found.", "Add tests.")],
};

const PROBLEM: ProblemForTest = { id: "prob1", status: "OPEN", giverId: "giver1", runtime: "PYTHON", dependencyPolicy: null };

function makeDeps(over: Partial<SolverTestDeps> = {}) {
  const scheduled: Array<() => Promise<unknown>> = [];
  const deps: SolverTestDeps = {
    findProblem: vi.fn(async () => PROBLEM),
    runPreflight: vi.fn(async (): Promise<PreflightResult> => ({ ok: true, commitSha: SHA, plan: okPlan, bountiedJson: null })),
    getQuote: vi.fn(async () => ({
      costUsd: 0.04, free: true, freeBountiesRemaining: 4, creditUsd: 1, earningsUsd: 0, canAfford: true, shortfallUsd: 0,
    })),
    begin: vi.fn(async () => ({ ok: true, runId: "run1", isFree: true, chargedFromCredit: 0, chargedFromEarnings: 0 })),
    execute: vi.fn(async () => ({})),
    schedule: vi.fn((task) => {
      scheduled.push(task);
    }),
    findRun: vi.fn(async () => null),
    reap: vi.fn(async () => 0),
    ...over,
  };
  return { deps, scheduled };
}

const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  id: "run1", solverId: "solver1", status: "FAILED", isFree: false, commitSha: SHA, mode: "tests", exitCode: 1,
  output: "1 failed", errorCode: "TESTS_FAILED", errorMessage: "Your tests failed. Run them locally.",
  refundedAt: null, createdAt: new Date(0), finishedAt: new Date(1), ...over,
});

describe("shared request rules (preflight and run)", () => {
  for (const [name, call] of [
    ["preflight", handlePreflight],
    ["run", handleRun],
  ] as const) {
    describe(name, () => {
      it("401s without a session and touches nothing", async () => {
        const { deps } = makeDeps();
        const r = await call(null, GOOD_BODY, deps);
        expect(r.status).toBe(401);
        expect(deps.findProblem).not.toHaveBeenCalled();
      });

      it("409s when GitHub isn't connected", async () => {
        const { deps } = makeDeps();
        const r = await call({ id: "solver1", githubAccessToken: null }, GOOD_BODY, deps);
        expect(r.status).toBe(409);
        expect(r.body.code).toBe("GITHUB_NOT_CONNECTED");
      });

      it("400s on a bad body, a missing problemId, and non-GitHub or deep repo URLs", async () => {
        const { deps } = makeDeps();
        for (const body of [
          null, "x", [], {},
          { repoUrl: GOOD_BODY.repoUrl },
          { problemId: "prob1" },
          { problemId: "prob1", repoUrl: "https://evil.example/a/b" },
          { problemId: "prob1", repoUrl: "https://github.com/a/b/tree/main" },
          { problemId: "prob1", repoUrl: "http://github.com/a/b" },
          { problemId: "../etc", repoUrl: GOOD_BODY.repoUrl },
        ]) {
          expect((await call(USER, body, deps)).status).toBe(400);
        }
        expect(deps.runPreflight).not.toHaveBeenCalled();
      });

      it("404s an unknown problem, 409s a closed one, 403s the Giver's own", async () => {
        expect((await call(USER, GOOD_BODY, makeDeps({ findProblem: async () => null }).deps)).status).toBe(404);
        expect((await call(USER, GOOD_BODY, makeDeps({ findProblem: async () => ({ ...PROBLEM, status: "FUNDED" }) }).deps)).status).toBe(409);
        expect((await call(USER, GOOD_BODY, makeDeps({ findProblem: async () => ({ ...PROBLEM, giverId: "solver1" }) }).deps)).status).toBe(403);
      });

      it("takes identity, token and runtime from the server, ignoring the body", async () => {
        const { deps } = makeDeps({ findProblem: async () => ({ ...PROBLEM, runtime: "NODE" }) });
        await call(USER, { ...GOOD_BODY, solverId: "someone-else", runtime: "PYTHON", githubAccessToken: "stolen" }, deps);
        expect(deps.runPreflight).toHaveBeenCalledWith({
          repoUrl: GOOD_BODY.repoUrl,
          solverToken: "gho_solver_token",
          runtime: "NODE",
        });
      });

      it("rebuilds the repo URL from owner/repo", async () => {
        const { deps } = makeDeps();
        await call(USER, { ...GOOD_BODY, repoUrl: "https://github.com/Owner/Repo.git?x=1#y".replace("?x=1#y", "") }, deps);
        expect((deps.runPreflight as ReturnType<typeof vi.fn>).mock.calls[0][0].repoUrl).toBe("https://github.com/Owner/Repo");
      });

      it("422s with the reason when the repo can't be read", async () => {
        const { deps } = makeDeps({ runPreflight: async () => ({ ok: false, reason: "Repository not found." }) });
        const r = await call(USER, GOOD_BODY, deps);
        expect(r.status).toBe(422);
        expect(r.body.code).toBe("REPO_UNREADABLE");
        expect(r.body.error).toBe("Repository not found.");
      });
    });
  }
});

describe("handlePreflight", () => {
  it("returns the commit, the plan and the price, and charges nothing", async () => {
    const { deps } = makeDeps();
    const r = await handlePreflight(USER, GOOD_BODY, deps);
    expect(r.status).toBe(200);
    expect(r.body.commitSha).toBe(SHA);
    expect((r.body.plan as { ok: boolean }).ok).toBe(true);
    expect((r.body.quote as { free: boolean }).free).toBe(true);
    expect(deps.begin).not.toHaveBeenCalled();
    expect(deps.schedule).not.toHaveBeenCalled();
  });

  it("does not expose the effective manifest to the browser", async () => {
    const { deps } = makeDeps();
    const r = await handlePreflight(USER, GOOD_BODY, deps);
    expect(JSON.stringify(r.body)).not.toContain("effectiveManifest");
  });

  it("still returns 200 with the findings when the plan isn't runnable", async () => {
    const { deps } = makeDeps({ runPreflight: async () => ({ ok: true, commitSha: SHA, plan: badPlan, bountiedJson: null }) });
    const r = await handlePreflight(USER, GOOD_BODY, deps);
    expect(r.status).toBe(200);
    expect((r.body.plan as { ok: boolean }).ok).toBe(false);
  });
});

describe("dependency policy", () => {
  const pre = (bountiedJson: string | null): PreflightResult => ({ ok: true, commitSha: SHA, plan: okPlan, bountiedJson });

  it("leaves the plan alone when the bounty has no policy", () => {
    expect(applyDependencyPolicy(pre('{"dependencies":{"requests":"2.31.0"}}'), null)).toBe(okPlan);
  });

  it("blocks a banned package with a DEPENDENCY_POLICY error and no manifest", () => {
    const plan = applyDependencyPolicy(pre('{"dependencies":{"requests":"2.31.0"}}'), { bannedPackages: ["requests"] });
    expect(plan.ok).toBe(false);
    expect(plan.effectiveManifest).toBeNull();
    expect(plan.findings[0].code).toBe("DEPENDENCY_POLICY");
    expect(plan.findings[0].severity).toBe("error");
  });

  it("lets a compliant manifest through unchanged", () => {
    const plan = applyDependencyPolicy(pre('{"dependencies":{"requests":"2.31.0"}}'), { allowedPackages: ["requests"] });
    expect(plan.ok).toBe(true);
  });

  it("never makes an unrunnable plan runnable", () => {
    const plan = applyDependencyPolicy({ ok: true, commitSha: SHA, plan: badPlan, bountiedJson: null }, { maxDependencies: 5 });
    expect(plan.ok).toBe(false);
  });

  it("stops a run before charging when the policy is violated", async () => {
    const { deps } = makeDeps({
      findProblem: async () => ({ ...PROBLEM, dependencyPolicy: { maxDependencies: 0 } }),
      runPreflight: async () => ({ ok: true, commitSha: SHA, plan: okPlan, bountiedJson: '{"dependencies":{"requests":"2.31.0"}}' }),
    });
    const r = await handleRun(USER, GOOD_BODY, deps);
    expect(r.status).toBe(422);
    expect(deps.begin).not.toHaveBeenCalled();
  });
});

describe("handleRun", () => {
  it("refuses to charge an unrunnable plan", async () => {
    const { deps } = makeDeps({ runPreflight: async () => ({ ok: true, commitSha: SHA, plan: badPlan, bountiedJson: null }) });
    const r = await handleRun(USER, GOOD_BODY, deps);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("PLAN_NOT_RUNNABLE");
    expect(deps.begin).not.toHaveBeenCalled();
    expect(deps.schedule).not.toHaveBeenCalled();
  });

  it("stops without charging when the repo moved since the check the Solver saw", async () => {
    const { deps } = makeDeps();
    const r = await handleRun(USER, { ...GOOD_BODY, expectedCommitSha: "b".repeat(40) }, deps);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("COMMIT_CHANGED");
    expect(r.body.commitSha).toBe(SHA);
    expect(deps.begin).not.toHaveBeenCalled();
  });

  it("rejects a malformed expectedCommitSha instead of ignoring it", async () => {
    const { deps } = makeDeps();
    expect((await handleRun(USER, { ...GOOD_BODY, expectedCommitSha: "main" }, deps)).status).toBe(409);
    expect(deps.begin).not.toHaveBeenCalled();
  });

  it("rejects a selected commit if GitHub does not resolve that exact SHA", async () => {
    const { deps } = makeDeps();
    const r = await handleRun(USER, { ...GOOD_BODY, commitSha: "c".repeat(40) }, deps);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("COMMIT_UNAVAILABLE");
    expect(deps.begin).not.toHaveBeenCalled();
  });

  it("answers 202 with the run id, and runs the sandbox only after the response", async () => {
    const { deps, scheduled } = makeDeps();
    const r = await handleRun(USER, GOOD_BODY, deps);
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ runId: "run1", commitSha: SHA, free: true, reused: false, chargedUsd: 0 });
    expect(deps.execute).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    await scheduled[0]();
    expect(deps.execute).toHaveBeenCalledWith({
      runId: "run1", runtime: "PYTHON", repoUrl: GOOD_BODY.repoUrl, solverToken: "gho_solver_token", commitSha: SHA, plan: okPlan,
    });
  });

  it("reports what a paid run cost", async () => {
    const { deps } = makeDeps({
      begin: async () => ({ ok: true, runId: "run2", isFree: false, chargedFromCredit: 0.03, chargedFromEarnings: 0.01 }),
    });
    const r = await handleRun(USER, GOOD_BODY, deps);
    expect(r.body.free).toBe(false);
    expect(r.body.chargedUsd).toBe(0.04);
  });

  it("maps billing and quota refusals to the right statuses and schedules nothing", async () => {
    const cases: Array<[string, number]> = [
      ["INSUFFICIENT_FUNDS", 402], ["ATTEMPTS_EXHAUSTED", 409], ["TOO_MANY_RUNNING", 429], ["NOT_OPEN", 409], ["OWN_PROBLEM", 403],
    ];
    for (const [code, status] of cases) {
      const { deps } = makeDeps({
        begin: async () => ({ ok: false, code: code as never, message: "no", requiredUsd: 0.04, availableUsd: 0.01 }),
      });
      const r = await handleRun(USER, GOOD_BODY, deps);
      expect(r.status).toBe(status);
      expect(r.body.code).toBe(code);
      expect(deps.schedule).not.toHaveBeenCalled();
    }
    const { deps } = makeDeps({
      begin: async () => ({ ok: false, code: "INSUFFICIENT_FUNDS", message: "no", requiredUsd: 0.04, availableUsd: 0.01 }),
    });
    const r = await handleRun(USER, GOOD_BODY, deps);
    expect(r.body.requiredUsd).toBe(0.04);
    expect(r.body.availableUsd).toBe(0.01);
  });

  it("swallows (and logs) a failure in the background task instead of crashing it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, scheduled } = makeDeps({ execute: async () => { throw new Error("boom"); } });
    await handleRun(USER, GOOD_BODY, deps);
    await expect(scheduled[0]()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("handleStatus", () => {
  it("401s without a session", async () => {
    const { deps } = makeDeps();
    expect((await handleStatus(null, "run1", deps)).status).toBe(401);
  });

  it("400s a malformed id before any lookup", async () => {
    const { deps } = makeDeps();
    expect((await handleStatus(USER, "../../x", deps)).status).toBe(400);
    expect(deps.findRun).not.toHaveBeenCalled();
  });

  it("returns the run to its owner, with a docs link for its error code", async () => {
    const { deps } = makeDeps({ findRun: async () => run() });
    const r = await handleStatus(USER, "run1", deps);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("FAILED");
    expect(r.body.output).toBe("1 failed");
    expect(r.body.docsUrl).toBe("/docs/sandbox#TESTS_FAILED");
    expect(r.body.refunded).toBe(false);
  });

  it("gives another user a 404, not the run (and not a hint it exists)", async () => {
    const { deps } = makeDeps({ findRun: async () => run({ solverId: "someone-else" }) });
    const r = await handleStatus(USER, "run1", deps);
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toContain("1 failed");
  });

  it("404s an unknown run", async () => {
    const { deps } = makeDeps({ findRun: async () => null });
    expect((await handleStatus(USER, "run1", deps)).status).toBe(404);
  });

  it("reaps this Solver's stale runs first, so a dead run shows as refunded ERROR", async () => {
    const order: string[] = [];
    const reap = vi.fn(async () => { order.push("reap"); return 1; });
    const { deps } = makeDeps({
      reap,
      findRun: async () => { order.push("find"); return run({ status: "ERROR", refundedAt: new Date(2), output: null }); },
    });
    const r = await handleStatus(USER, "run1", deps);
    expect(order).toEqual(["reap", "find"]);
    expect(r.body.refunded).toBe(true);
    expect(reap).toHaveBeenCalledWith("solver1");
  });

  it("has no docs link for a passing run", async () => {
    const { deps } = makeDeps({ findRun: async () => run({ status: "PASSED", errorCode: null, errorMessage: null, exitCode: 0 }) });
    expect((await handleStatus(USER, "run1", deps)).body.docsUrl).toBeNull();
  });
});
