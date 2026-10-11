import { describe, expect, it } from "vitest";
import { EXAMPLE_MANIFEST, FINDING_GROUPS, RESULT_GROUPS, SANDBOX_DOCS } from "./docs-content";
import { DIAGNOSIS_CODES, diagnose } from "./diagnose";
import type { DiagnoseInput } from "./diagnose";
import { FINDING_CODES, makeFinding, sandboxDocsUrl } from "./findings";
import { parseBountiedManifest } from "@/lib/sandbox/bountied-manifest";

describe("sandbox docs registry", () => {
  const allCodes = [...FINDING_CODES, ...DIAGNOSIS_CODES];

  it("has an entry, with steps, for every finding and diagnosis code", () => {
    for (const code of allCodes) {
      const e = SANDBOX_DOCS[code];
      expect(e, code).toBeDefined();
      expect(e.title.length, code).toBeGreaterThan(0);
      expect(e.what.length, code).toBeGreaterThan(10);
      expect(e.steps.length, code).toBeGreaterThan(0);
    }
  });

  it("gives every code its own anchor", () => {
    expect(new Set(allCodes).size).toBe(allCodes.length);
    expect(Object.keys(SANDBOX_DOCS).sort()).toEqual([...allCodes].sort());
  });

  it("lists each code exactly once on the page", () => {
    const listed = [...FINDING_GROUPS.flatMap((g) => g.codes), ...RESULT_GROUPS.flatMap((g) => g.codes)];
    expect([...listed].sort()).toEqual([...allCodes].sort());
  });

  it("points every in-product link at an anchor that exists", () => {
    for (const code of allCodes) {
      expect(sandboxDocsUrl(code)).toBe(`/docs/sandbox#${code}`);
      expect(SANDBOX_DOCS[code]).toBeDefined();
    }
    expect(makeFinding("NO_TESTS", "error", "m", "f").docsUrl).toBe("/docs/sandbox#NO_TESTS");
  });

  it("titles finding docs with the same title the check shows", () => {
    for (const code of FINDING_CODES) {
      expect(SANDBOX_DOCS[code].title).toBe(makeFinding(code, "info", "m", "f").title);
    }
  });

  it("matches what the diagnosis really does with the Solver's money, for every result code", () => {
    // One representative input per diagnosis code. The docs' charged / not-charged label must agree with diagnose().
    const cases: Array<[string, DiagnoseInput]> = [
      ["PLATFORM_ERROR", { runtime: "PYTHON", mode: "tests", failureKind: "infra" }],
      ["SETUP_PROBLEM", { runtime: "PYTHON", mode: "tests", failureKind: "clone" }],
      ["DEP_VERSION_NOT_FOUND", { runtime: "PYTHON", mode: "tests", failureKind: "dependency-install", output: "No matching distribution found for x==9" }],
      ["DEPENDENCY_INSTALL_FAILED", { runtime: "PYTHON", mode: "tests", failureKind: "dependency-install", output: "build failed" }],
      ["TIMEOUT", { runtime: "PYTHON", mode: "entry", failureKind: "timeout" }],
      ["PY_MODULE_NOT_FOUND", { runtime: "PYTHON", mode: "entry", exitCode: 1, output: "ModuleNotFoundError: No module named 'numpy'" }],
      ["PY_NO_TESTS_COLLECTED", { runtime: "PYTHON", mode: "tests", exitCode: 5, output: "no tests ran" }],
      ["PY_SYNTAX_ERROR", { runtime: "PYTHON", mode: "entry", exitCode: 1, output: "SyntaxError: invalid syntax" }],
      ["NODE_MODULE_NOT_FOUND", { runtime: "NODE", mode: "entry", exitCode: 1, output: "Error: Cannot find module 'express'" }],
      ["NODE_FILE_NOT_FOUND", { runtime: "NODE", mode: "entry", exitCode: 1, output: "Error: Cannot find module './util'" }],
      ["NODE_NO_PACKAGE_JSON", { runtime: "NODE", mode: "tests", exitCode: 254, output: "npm error code ENOENT package.json" }],
      ["NODE_NO_TEST_SCRIPT", { runtime: "NODE", mode: "tests", exitCode: 1, output: 'npm error Missing script: "test"' }],
      ["NODE_SYNTAX_ERROR", { runtime: "NODE", mode: "entry", exitCode: 1, output: "SyntaxError: Unexpected token" }],
      ["TESTS_FAILED", { runtime: "PYTHON", mode: "tests", exitCode: 1, output: "1 failed" }],
      ["PROGRAM_FAILED", { runtime: "PYTHON", mode: "entry", exitCode: 2, output: "boom" }],
    ];
    expect(cases.map(([code]) => code).sort()).toEqual([...DIAGNOSIS_CODES].sort());
    for (const [code, input] of cases) {
      const d = diagnose(input);
      expect(d?.code, code).toBe(code);
      const expected = d?.status === "ERROR" ? "not-charged" : "charged";
      expect(SANDBOX_DOCS[code as keyof typeof SANDBOX_DOCS].money, code).toBe(expected);
    }
  });

  it("only labels check findings as free", () => {
    for (const code of FINDING_CODES) expect(SANDBOX_DOCS[code].money).toBe("free-check");
    for (const code of DIAGNOSIS_CODES) expect(SANDBOX_DOCS[code].money).not.toBe("free-check");
  });

  it("shows a bountied.json example the real parser accepts", () => {
    const parsed = parseBountiedManifest(EXAMPLE_MANIFEST);
    expect(parsed.parseError).toBeNull();
    expect(parsed.manifest?.executionMode).toBe("test");
    expect(parsed.manifest?.dependencies.map((d) => d.name)).toEqual(["requests", "pytest"]);
  });
});
