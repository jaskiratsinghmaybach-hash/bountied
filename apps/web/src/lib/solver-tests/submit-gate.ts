import { parseGithubRepoUrl } from "@/lib/github/repo-snapshot";
import { sandboxDocsUrl } from "./findings";

/**
 * The rule that connects a Solver's test to their submission (product
 * decisions: a commit whose test FAILED or ERRORED cannot be submitted;
 * untested submissions are allowed and marked UNTESTED; testStatus is PASSED
 * only if the repo's HEAD equals a passing run's commit).
 *
 * Pure on purpose, so every case is unit-tested. createSubmission supplies the
 * runs and the current HEAD; the decision here is the only thing that can set
 * testStatus, testedCommitSha or testRunId on a Submission. They are never
 * taken from client input.
 */

export type GateRun = {
  id: string;
  repoUrl: string;
  commitSha: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
};

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type GateDecision = {
  allow: boolean;
  /** Set when allow. */
  testStatus?: "UNTESTED" | "PASSED";
  testedCommitSha?: string | null;
  testRunId?: string | null;
  /** Set when !allow. */
  code?: "TEST_RUNNING" | "TEST_FAILED" | "TEST_ERROR" | "HEAD_UNVERIFIABLE";
  /** Set when !allow. Tells the Solver what happened and how to fix it. */
  message?: string;
  docsUrl?: string | null;
};

/** GitHub owner and repo names are case-insensitive, so compare them that way. */
export function sameRepo(a: string, b: string): boolean {
  const pa = parseGithubRepoUrl(a);
  const pb = parseGithubRepoUrl(b);
  if (!pa || !pb) return false;
  return pa.owner.toLowerCase() === pb.owner.toLowerCase() && pa.repo.toLowerCase() === pb.repo.toLowerCase();
}

const newestFirst = (x: GateRun, y: GateRun) => y.createdAt.getTime() - x.createdAt.getTime();

/**
 * @param runs     this Solver's runs on this problem (any repo; filtered here)
 * @param repoUrl  the repo being submitted
 * @param headSha  the repo's current HEAD, or null if it could not be read.
 *                 Only needed when the Solver has tested this repo.
 */
export function decideSubmitGate(params: { runs: GateRun[]; repoUrl: string; headSha: string | null; selectedCommitSha?: string | null }): GateDecision {
  const { runs, repoUrl, headSha, selectedCommitSha } = params;
  const targetSha = selectedCommitSha ?? headSha;
  const mine = runs.filter((r) => sameRepo(r.repoUrl, repoUrl));

  // Never tested this repo: allowed, marked UNTESTED. No GitHub call needed.
  if (mine.length === 0) return untested();

  // Tested before, but we can't tell which commit is submitted. Don't guess in either direction.
  if (!targetSha) {
    return {
      allow: false,
      code: "HEAD_UNVERIFIABLE",
      message: "We couldn't check your repository's latest commit just now, so we can't match it to your tests. Try again in a moment.",
      docsUrl: null,
    };
  }

  const atHead = mine.filter((r) => r.commitSha === targetSha).sort(newestFirst);
  if (atHead.length === 0) return untested(); // this exact commit has not been tested

  const passed = atHead.find((r) => r.status === "PASSED");
  if (passed) return { allow: true, testStatus: "PASSED", testedCommitSha: passed.commitSha, testRunId: passed.id };

  const running = atHead.find((r) => r.status === "RUNNING");
  if (running) {
    return {
      allow: false,
      code: "TEST_RUNNING",
      message: "A test of your latest commit is still running. Wait for it to finish, then submit.",
      docsUrl: null,
    };
  }

  const last = atHead[0];
  const detail = last.errorMessage ?? "The test did not pass.";
  if (last.status === "ERROR") {
    return {
      allow: false,
      code: "TEST_ERROR",
      message: `The last test of your latest commit ended with a setup problem: ${detail} You weren't charged. Run the test again before submitting.`,
      docsUrl: last.errorCode ? sandboxDocsUrl(last.errorCode) : null,
    };
  }
  return {
    allow: false,
    code: "TEST_FAILED",
    message: `Your latest commit failed its test: ${detail} Fix it, push, and test again before submitting.`,
    docsUrl: last.errorCode ? sandboxDocsUrl(last.errorCode) : null,
  };
}

function untested(): GateDecision {
  return { allow: true, testStatus: "UNTESTED", testedCommitSha: null, testRunId: null };
}

export type SubmitGateDeps = {
  findRuns(params: { solverId: string; problemId: string }): Promise<GateRun[]>;
  fetchHead(params: { repoUrl: string; token: string }): Promise<{ ok: boolean; commitSha?: string }>;
};

/** Looks up the facts, then decides. HEAD is fetched only when the Solver actually tested this repo. */
export async function evaluateSubmitGate(
  params: { solverId: string; problemId: string; repoUrl: string; solverToken: string | null; selectedCommitSha?: string | null },
  deps: SubmitGateDeps
): Promise<GateDecision> {
  const runs = await deps.findRuns({ solverId: params.solverId, problemId: params.problemId });
  if (!runs.some((r) => sameRepo(r.repoUrl, params.repoUrl))) return untested();

  let headSha: string | null = params.selectedCommitSha ?? null;
  if (!params.selectedCommitSha && params.solverToken) {
    const head = await deps.fetchHead({ repoUrl: params.repoUrl, token: params.solverToken });
    if (head.ok && head.commitSha) headSha = head.commitSha;
  }
  return decideSubmitGate({ runs, repoUrl: params.repoUrl, headSha, selectedCommitSha: params.selectedCommitSha });
}

/**
 * Mirror-time re-check. The Submission was created PASSED for one commit; the
 * Solver may have pushed again before the mirror ran. The mirror copies
 * whatever HEAD is NOW, so unless it is still the tested commit the submission
 * must drop back to UNTESTED. An unreadable mirrored commit counts as "not
 * verified" and also drops back.
 */
export function shouldKeepPassed(params: {
  testStatus: string;
  testedCommitSha: string | null;
  mirroredCommitSha: string | null | undefined;
}): boolean {
  if (params.testStatus !== "PASSED") return true; // nothing to protect
  return !!params.testedCommitSha && !!params.mirroredCommitSha && params.testedCommitSha === params.mirroredCommitSha;
}
