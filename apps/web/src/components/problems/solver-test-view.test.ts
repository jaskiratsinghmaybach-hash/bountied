import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SolverTestView, canRunNow, describePlan, runButtonLabel, shortSha } from "./solver-test-view";
import type { PanelPlan, PanelQuote, PanelRun, PanelState } from "./solver-test-view";

const SHA = "abcdef1234567890abcdef1234567890abcdef12";

const quote = (over: Partial<PanelQuote> = {}): PanelQuote => ({
  costUsd: 0.04, free: true, freeBountiesRemaining: 4, creditUsd: 1, earningsUsd: 0, canAfford: true, shortfallUsd: 0, ...over,
});
const plan = (over: Partial<PanelPlan> = {}): PanelPlan => ({
  ok: true, mode: "tests", entrypoint: null, addPytest: true, install: true, findings: [], ...over,
});
const run = (over: Partial<PanelRun> = {}): PanelRun => ({
  runId: "r1", status: "PASSED", free: true, commitSha: SHA, exitCode: 0, output: "3 passed", errorCode: null,
  errorMessage: null, docsUrl: null, refunded: false, ...over,
});

const noop = () => {};
const render = (state: PanelState, repoSelected = true) =>
  renderToStaticMarkup(createElement(SolverTestView, { repoSelected, state, onCheck: noop, onRun: noop, onReset: noop }));

describe("helpers", () => {
  it("shortens a commit to 7 characters", () => {
    expect(shortSha(SHA)).toBe("abcdef1");
    expect(shortSha(null)).toBe("");
  });

  it("says what will run in the Solver's words", () => {
    expect(describePlan(plan())).toBe("your tests, with pytest");
    expect(describePlan(plan({ addPytest: false }))).toBe("your tests");
    expect(describePlan(plan({ mode: "entry", entrypoint: "main.py" }))).toBe("your entry file main.py");
    expect(describePlan(plan({ mode: null }))).toBe("nothing yet");
  });

  it("labels the run button with the real price", () => {
    expect(runButtonLabel(quote({ free: true }))).toBe("Run test (free)");
    expect(runButtonLabel(quote({ free: false, costUsd: 0.04 }))).toBe("Run test ($0.04)");
  });

  it("allows a run only for a runnable plan the Solver can afford", () => {
    expect(canRunNow({ phase: "checked", plan: plan(), quote: quote() })).toBe(true);
    expect(canRunNow({ phase: "checked", plan: plan({ ok: false }), quote: quote() })).toBe(false);
    expect(canRunNow({ phase: "checked", plan: plan(), quote: quote({ canAfford: false }) })).toBe(false);
    expect(canRunNow({ phase: "idle", plan: plan(), quote: quote() })).toBe(false);
    expect(canRunNow({ phase: "running", plan: plan(), quote: quote() })).toBe(false);
    expect(canRunNow({ phase: "checked" })).toBe(false);
  });
});

describe("SolverTestView", () => {
  it("asks the Solver to pick a repo first", () => {
    const html = render({ phase: "idle" }, false);
    expect(html).toContain("Choose a repository above");
    expect(html).not.toContain("Check my repo");
  });

  it("offers a free check once a repo is chosen", () => {
    const html = render({ phase: "idle" });
    expect(html).toContain("Check my repo (free)");
    expect(html).toContain('type="button"'); // it sits inside the submit form
    expect(html).not.toContain('type="submit"');
  });

  it("shows a checking message", () => {
    expect(render({ phase: "checking" })).toContain("Checking your repository");
  });

  it("shows commit, what will run, and a free run button", () => {
    const html = render({ phase: "checked", commitSha: SHA, plan: plan(), quote: quote() });
    expect(html).toContain("commit abcdef1");
    expect(html).toContain("your tests, with pytest");
    expect(html).toContain("This test is free.");
    expect(html).toContain("Run test (free)");
    expect(/<button[^>]*\sdisabled=""[^>]*>Run test/.test(html)).toBe(false);
  });

  it("shows the price and where it comes from for a paid test", () => {
    const html = render({ phase: "checked", commitSha: SHA, plan: plan(), quote: quote({ free: false }) });
    expect(html).toContain("Run test ($0.04)");
    expect(html).toContain("deposited credit first, then your earnings");
  });

  it("disables the run button and links to funds when the Solver can't afford it", () => {
    const html = render({ phase: "checked", commitSha: SHA, plan: plan(), quote: quote({ free: false, canAfford: false, shortfallUsd: 0.03 }) });
    expect(html).toContain("You need $0.03 more");
    expect(html).toContain('href="/dashboard/solver/funds"');
    expect(/<button[^>]*\sdisabled=""[^>]*>Run test \(\$0\.04\)/.test(html)).toBe(true);
  });

  it("lists findings with a fix and a docs link, and disables running when the plan isn't runnable", () => {
    const html = render({
      phase: "checked",
      commitSha: SHA,
      quote: quote(),
      plan: plan({
        ok: false,
        findings: [
          { code: "NO_TESTS", severity: "error", title: "No tests found", message: "There is nothing to run.", fix: "Add test files.", docsUrl: "/docs/sandbox#NO_TESTS" },
          { code: "PLAN", severity: "info", title: "What will run", message: "Your tests.", fix: "Nothing to fix.", docsUrl: "/docs/sandbox#PLAN" },
        ],
      }),
    });
    expect(html).toContain("No tests found");
    expect(html).toContain("Add test files.");
    expect(html).toContain('href="/docs/sandbox#NO_TESTS"');
    expect(html).toContain("Fix the problems above");
    expect(/<button[^>]*\sdisabled=""[^>]*>Run test/.test(html)).toBe(true);
  });

  it("shows starting and keeps the buttons disabled", () => {
    const html = render({ phase: "starting", commitSha: SHA, plan: plan(), quote: quote() });
    expect(html).toContain("Starting…");
    expect(/<button[^>]*\sdisabled=""[^>]*>Starting/.test(html)).toBe(true);
  });

  it("shows a running state with the commit", () => {
    const html = render({ phase: "running", commitSha: SHA, run: run({ status: "RUNNING" }) });
    expect(html).toContain("Running your test");
    expect(html).toContain("commit abcdef1");
  });

  it("shows a pass, and explains what happens if the Solver pushes again", () => {
    const html = render({ phase: "done", run: run() });
    expect(html).toContain(">Passed<");
    expect(html).toContain("exit 0");
    expect(html).toContain("This exact commit passed.");
    expect(html).toContain("newer commits exist");
  });

  it("shows a failure with the diagnosis, exit code, docs link and output open", () => {
    const html = render({
      phase: "done",
      run: run({ status: "FAILED", exitCode: 1, output: "1 failed", errorCode: "TESTS_FAILED", errorMessage: "Your tests failed. Run them locally.", docsUrl: "/docs/sandbox#TESTS_FAILED" }),
    });
    expect(html).toContain(">Failed<");
    expect(html).toContain("Your tests failed. Run them locally.");
    expect(html).toContain("exit 1");
    expect(html).toContain('href="/docs/sandbox#TESTS_FAILED"');
    expect(html).toContain("1 failed");
    expect(html).toContain("<details");
    expect(html).toMatch(/<details[^>]*open/);
  });

  it("says an ERROR run wasn't charged and didn't use the free test", () => {
    const html = render({
      phase: "done",
      run: run({ status: "ERROR", exitCode: null, output: null, errorCode: "PLATFORM_ERROR", errorMessage: "Bountied had a problem. Try again.", refunded: true }),
    });
    expect(html).toContain("Couldn&#x27;t run");
    expect(html).toContain("not charged");
    expect(html).toContain("Try again");
  });

  it("shows a server error with a link when there is one", () => {
    const html = render({ phase: "idle", error: { message: "Connect your GitHub account first.", link: { href: "/integrations", label: "Go to Integrations" } } });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Connect your GitHub account first.");
    expect(html).toContain('href="/integrations"');
  });

  it("renders the Solver's output as text, never as markup", () => {
    const html = render({ phase: "done", run: run({ status: "FAILED", exitCode: 1, output: '<img src=x onerror="alert(1)"><script>x</script>' }) });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("links to the how-tests-work docs", () => {
    expect(render({ phase: "idle" })).toContain('href="/docs/sandbox"');
  });
});

