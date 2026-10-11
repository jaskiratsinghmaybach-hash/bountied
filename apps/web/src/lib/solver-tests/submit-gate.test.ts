import { describe, expect, it, vi } from "vitest";
import { decideSubmitGate, evaluateSubmitGate, sameRepo, shouldKeepPassed } from "./submit-gate";
import type { GateRun, SubmitGateDeps } from "./submit-gate";

const REPO = "https://github.com/solver/project";
const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);

let n = 0;
const runOf = (over: Partial<GateRun> = {}): GateRun => ({
  id: `run${++n}`, repoUrl: REPO, commitSha: A, status: "PASSED", errorCode: null, errorMessage: null,
  createdAt: new Date(1_000_000 + n * 1000), ...over,
});

describe("sameRepo", () => {
  it("ignores case, .git and trailing differences GitHub itself ignores", () => {
    expect(sameRepo("https://github.com/Solver/Project", "https://github.com/solver/project.git")).toBe(true);
  });
  it("tells different repos apart and rejects garbage", () => {
    expect(sameRepo("https://github.com/solver/a", "https://github.com/solver/b")).toBe(false);
    expect(sameRepo("https://github.com/solver/a", "https://github.com/other/a")).toBe(false);
    expect(sameRepo("nonsense", REPO)).toBe(false);
  });
});

describe("decideSubmitGate", () => {
  it("allows an untested repo as UNTESTED, without needing HEAD", () => {
    const d = decideSubmitGate({ runs: [], repoUrl: REPO, headSha: null });
    expect(d).toEqual({ allow: true, testStatus: "UNTESTED", testedCommitSha: null, testRunId: null });
  });

  it("ignores runs on a different repo", () => {
    const d = decideSubmitGate({ runs: [runOf({ repoUrl: "https://github.com/solver/other", status: "FAILED" })], repoUrl: REPO, headSha: null });
    expect(d.allow).toBe(true);
    expect(d.testStatus).toBe("UNTESTED");
  });

  it("marks PASSED only when HEAD equals the passing run's commit", () => {
    const pass = runOf({ commitSha: A, status: "PASSED" });
    const d = decideSubmitGate({ runs: [pass], repoUrl: REPO, headSha: A });
    expect(d).toEqual({ allow: true, testStatus: "PASSED", testedCommitSha: A, testRunId: pass.id });
  });

  it("downgrades to UNTESTED when the repo moved past the passing commit", () => {
    const d = decideSubmitGate({ runs: [runOf({ commitSha: A, status: "PASSED" })], repoUrl: REPO, headSha: B });
    expect(d.allow).toBe(true);
    expect(d.testStatus).toBe("UNTESTED");
    expect(d.testedCommitSha).toBeNull();
    expect(d.testRunId).toBeNull();
  });

  it("allows a new commit even if an OLDER commit failed", () => {
    const d = decideSubmitGate({ runs: [runOf({ commitSha: A, status: "FAILED" })], repoUrl: REPO, headSha: B });
    expect(d.allow).toBe(true);
    expect(d.testStatus).toBe("UNTESTED");
  });

  it("blocks a commit whose test FAILED, with guidance and a docs link", () => {
    const d = decideSubmitGate({
      runs: [runOf({ commitSha: A, status: "FAILED", errorCode: "TESTS_FAILED", errorMessage: "Your tests failed. Run them locally." })],
      repoUrl: REPO, headSha: A,
    });
    expect(d.allow).toBe(false);
    expect(d.code).toBe("TEST_FAILED");
    expect(d.message).toContain("Run them locally");
    expect(d.message).toMatch(/test again/i);
    expect(d.docsUrl).toBe("/docs/sandbox#TESTS_FAILED");
  });

  it("blocks a commit whose test ERRORED, and says the Solver wasn't charged", () => {
    const d = decideSubmitGate({
      runs: [runOf({ commitSha: A, status: "ERROR", errorCode: "PLATFORM_ERROR", errorMessage: "Bountied had a problem." })],
      repoUrl: REPO, headSha: A,
    });
    expect(d.allow).toBe(false);
    expect(d.code).toBe("TEST_ERROR");
    expect(d.message).toMatch(/weren't charged/);
  });

  it("blocks while a test of the current commit is still running", () => {
    const d = decideSubmitGate({ runs: [runOf({ commitSha: A, status: "RUNNING" })], repoUrl: REPO, headSha: A });
    expect(d.allow).toBe(false);
    expect(d.code).toBe("TEST_RUNNING");
  });

  it("lets a later PASS on the same commit override an earlier fail or error", () => {
    const failed = runOf({ commitSha: A, status: "FAILED", errorCode: "TESTS_FAILED" });
    const errored = runOf({ commitSha: A, status: "ERROR", errorCode: "PLATFORM_ERROR" });
    const pass = runOf({ commitSha: A, status: "PASSED" });
    const d = decideSubmitGate({ runs: [failed, errored, pass], repoUrl: REPO, headSha: A });
    expect(d.testStatus).toBe("PASSED");
    expect(d.testRunId).toBe(pass.id);
  });

  it("judges by the NEWEST non-passing run when none passed", () => {
    const old = runOf({ commitSha: A, status: "ERROR", errorCode: "PLATFORM_ERROR", createdAt: new Date(1) });
    const newer = runOf({ commitSha: A, status: "FAILED", errorCode: "TESTS_FAILED", createdAt: new Date(2) });
    expect(decideSubmitGate({ runs: [old, newer], repoUrl: REPO, headSha: A }).code).toBe("TEST_FAILED");
    expect(decideSubmitGate({ runs: [newer, old], repoUrl: REPO, headSha: A }).code).toBe("TEST_FAILED");
  });

  it("never marks PASSED from a passing run on a different commit", () => {
    const d = decideSubmitGate({ runs: [runOf({ commitSha: A, status: "PASSED" }), runOf({ commitSha: C, status: "FAILED" })], repoUrl: REPO, headSha: B });
    expect(d.testStatus).toBe("UNTESTED");
  });

  it("blocks, instead of guessing, when the Solver tested this repo but HEAD can't be read", () => {
    const d = decideSubmitGate({ runs: [runOf({ status: "FAILED" })], repoUrl: REPO, headSha: null });
    expect(d.allow).toBe(false);
    expect(d.code).toBe("HEAD_UNVERIFIABLE");
  });
});

describe("evaluateSubmitGate", () => {
  const deps = (runs: GateRun[], head: { ok: boolean; commitSha?: string }): SubmitGateDeps => ({
    findRuns: vi.fn(async () => runs),
    fetchHead: vi.fn(async () => head),
  });
  const base = { solverId: "s1", problemId: "p1", repoUrl: REPO, solverToken: "gho_tok" };

  it("does not call GitHub when the Solver never tested this repo", async () => {
    const d = deps([], { ok: true, commitSha: A });
    const r = await evaluateSubmitGate(base, d);
    expect(r.testStatus).toBe("UNTESTED");
    expect(d.fetchHead).not.toHaveBeenCalled();
  });

  it("asks only for this Solver's runs on this problem", async () => {
    const d = deps([], { ok: true });
    await evaluateSubmitGate(base, d);
    expect(d.findRuns).toHaveBeenCalledWith({ solverId: "s1", problemId: "p1" });
  });

  it("checks HEAD with the Solver's own token and marks PASSED on a match", async () => {
    const pass = runOf({ commitSha: A });
    const d = deps([pass], { ok: true, commitSha: A });
    const r = await evaluateSubmitGate(base, d);
    expect(d.fetchHead).toHaveBeenCalledWith({ repoUrl: REPO, token: "gho_tok" });
    expect(r.testStatus).toBe("PASSED");
  });

  it("blocks when HEAD can't be fetched", async () => {
    const r = await evaluateSubmitGate(base, deps([runOf()], { ok: false }));
    expect(r.code).toBe("HEAD_UNVERIFIABLE");
  });

  it("blocks when there is no token to check HEAD with", async () => {
    const d = deps([runOf()], { ok: true, commitSha: A });
    const r = await evaluateSubmitGate({ ...base, solverToken: null }, d);
    expect(r.code).toBe("HEAD_UNVERIFIABLE");
    expect(d.fetchHead).not.toHaveBeenCalled();
  });
});

describe("shouldKeepPassed (mirror-time re-check)", () => {
  it("keeps PASSED when the mirrored commit is the tested one", () => {
    expect(shouldKeepPassed({ testStatus: "PASSED", testedCommitSha: A, mirroredCommitSha: A })).toBe(true);
  });
  it("drops PASSED when the Solver pushed between submit and mirror", () => {
    expect(shouldKeepPassed({ testStatus: "PASSED", testedCommitSha: A, mirroredCommitSha: B })).toBe(false);
  });
  it("drops PASSED when the mirrored commit couldn't be read", () => {
    expect(shouldKeepPassed({ testStatus: "PASSED", testedCommitSha: A, mirroredCommitSha: null })).toBe(false);
    expect(shouldKeepPassed({ testStatus: "PASSED", testedCommitSha: A, mirroredCommitSha: undefined })).toBe(false);
  });
  it("drops PASSED when no tested commit is recorded", () => {
    expect(shouldKeepPassed({ testStatus: "PASSED", testedCommitSha: null, mirroredCommitSha: A })).toBe(false);
  });
  it("has nothing to change for an UNTESTED submission", () => {
    expect(shouldKeepPassed({ testStatus: "UNTESTED", testedCommitSha: null, mirroredCommitSha: null })).toBe(true);
  });
});
