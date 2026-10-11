import { describe, expect, it } from "vitest";
import { DIAGNOSIS_CODES, diagnose } from "./diagnose";
import type { DiagnoseInput } from "./diagnose";

const PY: Pick<DiagnoseInput, "runtime"> = { runtime: "PYTHON" };
const ND: Pick<DiagnoseInput, "runtime"> = { runtime: "NODE" };

describe("runs that ended without a result", () => {
  it("platform errors and setup problems are refunded", () => {
    const infra = diagnose({ ...PY, mode: "tests", failureKind: "infra" });
    expect(infra).toMatchObject({ code: "PLATFORM_ERROR", status: "ERROR", refundable: true });
    expect(infra?.hint).toContain("not charged");

    for (const kind of ["clone", "setup"] as const) {
      expect(diagnose({ ...PY, mode: "entry", failureKind: kind })).toMatchObject({ code: "SETUP_PROBLEM", status: "ERROR", refundable: true });
    }
  });

  it("a timeout is the Solver's, and is charged", () => {
    expect(diagnose({ ...ND, mode: "entry", failureKind: "timeout" })).toMatchObject({ code: "TIMEOUT", status: "FAILED", refundable: false });
  });

  it("separates a missing dependency version from other install failures", () => {
    const pip = "ERROR: Could not find a version that satisfies the requirement numpy==9.9 (from versions: 1.0)\nERROR: No matching distribution found for numpy==9.9";
    expect(diagnose({ ...PY, mode: "tests", failureKind: "dependency-install", output: pip })?.code).toBe("DEP_VERSION_NOT_FOUND");
    const npm = "npm error code ETARGET\nnpm error notarget No matching version found for lodash@99.0.0.";
    expect(diagnose({ ...ND, mode: "entry", failureKind: "dependency-install", output: npm })?.code).toBe("DEP_VERSION_NOT_FOUND");
    expect(diagnose({ ...PY, mode: "tests", failureKind: "dependency-install", output: "error: subprocess-exited-with-error" })).toMatchObject({
      code: "DEPENDENCY_INSTALL_FAILED",
      status: "FAILED",
    });
  });

  it("refunds an install that failed because the registry or network did", () => {
    for (const output of [
      "ERROR: Could not install packages due to an OSError: HTTPSConnectionPool: Read timed out.",
      "npm error code ECONNRESET\nnpm error network aborted",
      "npm error code ENOTFOUND",
      "Temporary failure in name resolution",
    ]) {
      expect(diagnose({ ...PY, mode: "tests", failureKind: "dependency-install", output })).toMatchObject({ code: "PLATFORM_ERROR", status: "ERROR" });
    }
  });
});

describe("Python output", () => {
  it("success is not a failure", () => {
    expect(diagnose({ ...PY, mode: "tests", exitCode: 0, output: "3 passed" })).toBeNull();
  });

  it("names the missing module and only its top-level package", () => {
    const d = diagnose({ ...PY, mode: "entry", exitCode: 1, output: "Traceback...\nModuleNotFoundError: No module named 'requests.adapters'" });
    expect(d).toMatchObject({ code: "PY_MODULE_NOT_FOUND", status: "FAILED" });
    expect(d?.hint).toContain('"requests"');
    expect(d?.hint).not.toContain("adapters");
  });

  it("finds a missing module that surfaced during pytest collection", () => {
    const out = "ERROR tests/test_a.py - ModuleNotFoundError: No module named 'numpy'\n1 error in 0.12s";
    expect(diagnose({ ...PY, mode: "tests", exitCode: 2, output: out })?.code).toBe("PY_MODULE_NOT_FOUND");
  });

  it("detects no tests collected by exit code 5 or by message", () => {
    expect(diagnose({ ...PY, mode: "tests", exitCode: 5, output: "" })?.code).toBe("PY_NO_TESTS_COLLECTED");
    expect(diagnose({ ...PY, mode: "tests", exitCode: 1, output: "no tests ran in 0.01s" })?.code).toBe("PY_NO_TESTS_COLLECTED");
    expect(diagnose({ ...PY, mode: "entry", exitCode: 5, output: "" })?.code).toBe("PROGRAM_FAILED");
  });

  it("detects syntax and indentation errors", () => {
    expect(diagnose({ ...PY, mode: "entry", exitCode: 1, output: '  File "main.py", line 3\n    print("hi"\nSyntaxError: \'(\' was never closed' })?.code).toBe("PY_SYNTAX_ERROR");
    expect(diagnose({ ...PY, mode: "tests", exitCode: 2, output: "ERROR test_a.py - IndentationError: unexpected indent" })?.code).toBe("PY_SYNTAX_ERROR");
  });

  it("falls back to tests-failed and program-failed", () => {
    expect(diagnose({ ...PY, mode: "tests", exitCode: 1, output: "2 failed, 1 passed in 0.2s" })).toMatchObject({ code: "TESTS_FAILED", status: "FAILED" });
    const program = diagnose({ ...PY, mode: "entry", exitCode: 3, output: "ValueError: bad input" });
    expect(program).toMatchObject({ code: "PROGRAM_FAILED", status: "FAILED" });
    expect(program?.title).toContain("code 3");
  });
});

describe("Node output", () => {
  it("separates a missing package from a missing file", () => {
    const pkg = diagnose({ ...ND, mode: "entry", exitCode: 1, output: "Error: Cannot find module 'express'\nRequire stack:\n- /home/user/submission/index.js\n  code: 'MODULE_NOT_FOUND'" });
    expect(pkg).toMatchObject({ code: "NODE_MODULE_NOT_FOUND" });
    expect(pkg?.hint).toContain('"express"');

    const file = diagnose({ ...ND, mode: "entry", exitCode: 1, output: "Error: Cannot find module '/home/user/submission/index.js'" });
    expect(file?.code).toBe("NODE_FILE_NOT_FOUND");
    expect(diagnose({ ...ND, mode: "entry", exitCode: 1, output: "Error: Cannot find module './util'" })?.code).toBe("NODE_FILE_NOT_FOUND");
  });

  it("detects a test runner that isn't installed", () => {
    const d = diagnose({ ...ND, mode: "tests", exitCode: 127, output: "> t@1.0.0 test\n> jest\n\nsh: 1: jest: not found" });
    expect(d).toMatchObject({ code: "NODE_MODULE_NOT_FOUND" });
    expect(d?.hint).toContain("jest");
  });

  it("detects a missing package.json and a missing test script", () => {
    const enoent = "npm error code ENOENT\nnpm error syscall open\nnpm error path /home/user/submission/package.json\nnpm error errno -2";
    expect(diagnose({ ...ND, mode: "tests", exitCode: 254, output: enoent })?.code).toBe("NODE_NO_PACKAGE_JSON");
    expect(diagnose({ ...ND, mode: "tests", exitCode: 1, output: 'npm error Missing script: "test"' })?.code).toBe("NODE_NO_TEST_SCRIPT");
  });

  it("detects syntax errors and falls back like Python", () => {
    expect(diagnose({ ...ND, mode: "entry", exitCode: 1, output: "SyntaxError: Unexpected token '}'" })?.code).toBe("NODE_SYNTAX_ERROR");
    expect(diagnose({ ...ND, mode: "tests", exitCode: 1, output: "Tests: 1 failed, 4 passed" })?.code).toBe("TESTS_FAILED");
    expect(diagnose({ ...ND, mode: "entry", exitCode: 1, output: "TypeError: x is not a function" })?.code).toBe("PROGRAM_FAILED");
  });

  it("doesn't apply Python rules to a Node run, or the reverse", () => {
    expect(diagnose({ ...ND, mode: "entry", exitCode: 1, output: "ModuleNotFoundError: No module named 'x'" })?.code).toBe("PROGRAM_FAILED");
    expect(diagnose({ ...PY, mode: "entry", exitCode: 1, output: "Error: Cannot find module 'x'" })?.code).toBe("PROGRAM_FAILED");
  });
});

describe("safety and shape", () => {
  it("never echoes unsafe characters from program output into a hint", () => {
    const evil = "ModuleNotFoundError: No module named 'x<script>alert(1)</script>'";
    const d = diagnose({ ...PY, mode: "entry", exitCode: 1, output: evil });
    expect(d?.hint).not.toContain("<");
    expect(d?.hint).not.toContain("alert(1)");
    const long = `Cannot find module '${"a".repeat(500)}'`;
    expect(diagnose({ ...ND, mode: "entry", exitCode: 1, output: long })?.hint.length).toBeLessThan(400);
  });

  it("every diagnosis links to its own docs anchor and only ERROR is refundable", () => {
    const inputs: DiagnoseInput[] = [
      { ...PY, mode: "tests", failureKind: "infra" },
      { ...PY, mode: "tests", failureKind: "clone" },
      { ...PY, mode: "tests", failureKind: "timeout" },
      { ...PY, mode: "tests", failureKind: "dependency-install", output: "x" },
      { ...PY, mode: "tests", exitCode: 1, output: "failed" },
      { ...ND, mode: "entry", exitCode: 1, output: "boom" },
    ];
    for (const input of inputs) {
      const d = diagnose(input);
      expect(d).not.toBeNull();
      expect(DIAGNOSIS_CODES).toContain(d?.code);
      expect(d?.docsUrl).toBe(`/docs/sandbox#${d?.code}`);
      expect(d?.refundable).toBe(d?.status === "ERROR");
    }
  });
});
