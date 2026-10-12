import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GiverSubmissionCard } from "./giver-submission-card";

const SHA = "abcdef1234567890abcdef1234567890abcdef12";
// What older rows hold: the runner's raw reason, including lines from the Solver's repo.
const LEAKY = "Dependency install failed (exit 1): npm ERR! Invalid package.json: \"secretFunction\": \"function hunter2() {}\"";

type Over = Partial<Parameters<typeof GiverSubmissionCard>[0]["submission"]>;
const render = (over: Over = {}) =>
  renderToStaticMarkup(
    createElement(GiverSubmissionCard, {
      submission: {
        id: "s1", status: "UNDER_REVIEW", writeup: "My approach", sandboxOutput: "3 passed", sandboxExitCode: 0,
        sandboxError: null, sandboxRanAt: new Date(0), submittedAt: new Date(0), isRevealed: false,
        platformRepoUrl: null, githubAccessGrantedAt: null, attemptNumber: 1,
        testStatus: "UNTESTED", testedCommitSha: null, solver: { name: "Sam" }, ...over,
      },
      problemId: "p1", giverId: "g1", freeReviewsLeft: 3, giverGithubUsername: null, problemCompleted: true,
    })
  );

describe("GiverSubmissionCard", () => {
  it("shows Untested when the Solver didn't run a passing test", () => {
    const html = render({ testStatus: "UNTESTED" });
    expect(html).toContain("Untested");
    expect(html).not.toContain("own test passed");
  });

  it("shows the passing commit (just the short hash, no code) for a tested submission", () => {
    const html = render({ testStatus: "PASSED", testedCommitSha: SHA });
    expect(html).toContain("own test passed");
    expect(html).toContain("commit abcdef1");
    expect(html).not.toContain(SHA);
    expect(html).not.toContain("Untested");
  });

  it("shows the exit code and output of the review run", () => {
    const html = render({ sandboxExitCode: 0, sandboxOutput: "3 passed" });
    expect(html).toContain("exit 0");
    expect(html).toContain("3 passed");
  });

  it("never shows a stored raw error, even from an older row", () => {
    const html = render({ status: "DEPENDENCY_INSTALL_FAILED", sandboxOutput: null, sandboxExitCode: null, sandboxError: LEAKY });
    expect(html).not.toContain("hunter2");
    expect(html).not.toContain("secretFunction");
    expect(html).not.toContain("package.json:");
    expect(html).not.toContain("Show raw error");
    expect(html).toContain("couldn&#x27;t install");
  });

  it("shows only a classified summary for an infrastructure failure", () => {
    const html = render({ status: "SANDBOX_FAILED", sandboxOutput: null, sandboxExitCode: null, sandboxError: "Sandbox execution failed: ECONNRESET at /srv/app/secret.ts" });
    expect(html).not.toContain("ECONNRESET");
    expect(html).not.toContain("/srv/app");
    expect(html).toMatch(/platform/i);
  });
});
