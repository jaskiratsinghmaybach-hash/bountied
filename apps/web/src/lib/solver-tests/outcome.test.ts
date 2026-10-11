import { describe, expect, it } from "vitest";
import { outcomeFromExecution } from "./outcome";
import type { ExecutionResult } from "@/lib/sandbox/execute";

const SHA = "a".repeat(40);
const base = { runtime: "PYTHON" as const, mode: "tests" as const };
const ran = (exitCode: number, stdout = "", stderr = ""): ExecutionResult => ({ ok: true, exitCode, stdout, stderr, commitSha: SHA });
const failed = (kind: ExecutionResult["kind"], extra: Partial<ExecutionResult> = {}): ExecutionResult => ({
  ok: false,
  kind,
  reason: "internal detail the Solver should not be shown verbatim",
  ...extra,
});

describe("outcomeFromExecution", () => {
  it("records exit 0 as PASSED with the program output", () => {
    const o = outcomeFromExecution({ ...base, result: ran(0, "3 passed", "warn") });
    expect(o.status).toBe("PASSED");
    expect(o.exitCode).toBe(0);
    expect(o.output).toBe("3 passed\nwarn");
    expect(o.errorCode).toBeNull();
  });

  it("records a failing test run as FAILED with a diagnosis", () => {
    const o = outcomeFromExecution({ ...base, result: ran(1, "1 failed") });
    expect(o.status).toBe("FAILED");
    expect(o.exitCode).toBe(1);
    expect(o.errorCode).toBe("TESTS_FAILED");
  });

  it("recognizes a missing Python module", () => {
    const o = outcomeFromExecution({ ...base, result: ran(1, "", "ModuleNotFoundError: No module named 'numpy'") });
    expect(o.status).toBe("FAILED");
    expect(o.errorCode).toBe("PY_MODULE_NOT_FOUND");
  });

  it("charges a program that runs too long (FAILED, not ERROR)", () => {
    const o = outcomeFromExecution({ ...base, result: failed("timeout") });
    expect(o.status).toBe("FAILED");
    expect(o.errorCode).toBe("TIMEOUT");
  });

  it.each(["infra", "clone", "setup"] as const)("records a %s failure as ERROR so it is refunded", (kind) => {
    const o = outcomeFromExecution({ ...base, result: failed(kind) });
    expect(o.status).toBe("ERROR");
    expect(o.output).toBeNull();
  });

  it("maps the platform failure kinds to the right codes", () => {
    expect(outcomeFromExecution({ ...base, result: failed("infra") }).errorCode).toBe("PLATFORM_ERROR");
    expect(outcomeFromExecution({ ...base, result: failed("clone") }).errorCode).toBe("SETUP_PROBLEM");
    expect(outcomeFromExecution({ ...base, result: failed("setup") }).errorCode).toBe("SETUP_PROBLEM");
  });

  it("charges a bad dependency version and keeps the install output for the Solver", () => {
    const o = outcomeFromExecution({
      ...base,
      result: failed("dependency-install", { output: "ERROR: No matching distribution found for foo==9" }),
    });
    expect(o.status).toBe("FAILED");
    expect(o.errorCode).toBe("DEP_VERSION_NOT_FOUND");
    expect(o.output).toContain("No matching distribution");
  });

  it("refunds an install that failed on a network problem", () => {
    const o = outcomeFromExecution({
      ...base,
      result: failed("dependency-install", { output: "ReadTimeoutError ... Temporary failure in name resolution" }),
    });
    expect(o.status).toBe("ERROR");
    expect(o.errorCode).toBe("PLATFORM_ERROR");
    expect(o.output).toBeNull();
  });

  it("never stores the runner's raw reason", () => {
    const o = outcomeFromExecution({ ...base, result: failed("clone", { reason: "fatal: token ghp_abc leaked here" }) });
    expect(o.errorMessage).not.toContain("ghp_abc");
    expect(o.errorMessage).not.toContain("fatal");
  });

  it("records a result from a different commit as ERROR, not as a pass", () => {
    const o = outcomeFromExecution({ ...base, result: ran(0, "ok"), expectedCommitSha: "b".repeat(40) });
    expect(o.status).toBe("ERROR");
    expect(o.errorCode).toBe("SETUP_PROBLEM");
  });

  it("accepts a result from the expected commit", () => {
    const o = outcomeFromExecution({ ...base, result: ran(0, "ok"), expectedCommitSha: SHA });
    expect(o.status).toBe("PASSED");
  });

  it("uses Node diagnosis for Node runs", () => {
    const o = outcomeFromExecution({
      runtime: "NODE",
      mode: "entry",
      result: ran(1, "", "Error: Cannot find module 'express'"),
    });
    expect(o.errorCode).toBe("NODE_MODULE_NOT_FOUND");
  });
});
