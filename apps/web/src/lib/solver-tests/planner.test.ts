import { describe, expect, it } from "vitest";
import { findPythonTests, hasRealNodeTestScript, parseRequirementNames, planRun } from "./planner";
import type { RepoSnapshot } from "./planner";

function py(over: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return { runtime: "PYTHON", files: [], bountiedJson: null, packageJson: null, requirementsTxt: null, ...over };
}
function node(over: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return { runtime: "NODE", files: [], bountiedJson: null, packageJson: null, requirementsTxt: null, ...over };
}
const codes = (plan: ReturnType<typeof planRun>) => plan.findings.map((f) => f.code);
const pkg = (obj: object) => JSON.stringify(obj);
const REAL_TEST = { scripts: { test: "jest" } };
const PLACEHOLDER = { scripts: { test: 'echo "Error: no test specified" && exit 1' } };

describe("helpers", () => {
  it("finds Python tests by name and by tests/ folder, ignoring vendored code", () => {
    expect(findPythonTests(["test_a.py", "b_test.py", "tests/helpers.py", "src/app.py", "README.md"])).toEqual([
      "test_a.py",
      "b_test.py",
      "tests/helpers.py",
    ]);
    expect(findPythonTests(["venv/lib/test_x.py", "node_modules/a/tests/t.py", "latest.py", "contest.py"])).toEqual([]);
  });

  it("treats npm's placeholder test script as no test script", () => {
    expect(hasRealNodeTestScript({ scripts: { test: "jest" } })).toBe(true);
    expect(hasRealNodeTestScript({ scripts: { test: 'echo "Error: no test specified" && exit 1' } })).toBe(false);
    expect(hasRealNodeTestScript({ scripts: { test: "exit 1" } })).toBe(false);
    expect(hasRealNodeTestScript({ scripts: { test: "" } })).toBe(false);
    expect(hasRealNodeTestScript({ scripts: {} })).toBe(false);
    expect(hasRealNodeTestScript(null)).toBe(false);
  });

  it("reads package names out of a requirements.txt", () => {
    const text = ["# comment", "numpy==1.26.0", "Requests[security]>=2  # inline", "-r other.txt", "git+https://x/y.git", "typing_extensions ; python_version<'3.9'", ""].join("\n");
    expect(parseRequirementNames(text)).toEqual(["numpy", "requests", "typing-extensions"]);
  });
});

describe("Python", () => {
  it("runs the tests with pytest and adds pytest when it isn't declared", () => {
    const plan = planRun(py({ files: ["main.py", "test_main.py"] }));
    expect(plan.ok).toBe(true);
    expect(plan.mode).toBe("tests");
    expect(plan.addPytest).toBe(true);
    expect(plan.install).toBe(true);
    expect(plan.effectiveManifest).toEqual({ dependencies: [{ name: "pytest", version: null }], executionMode: "test" });
    expect(codes(plan)).toEqual(["PYTEST_ADDED", "PLAN"]);
  });

  it("doesn't add pytest when it is already declared", () => {
    const plan = planRun(py({ files: ["tests/test_a.py"], bountiedJson: '{"dependencies":{"pytest":"8.0.0","numpy":"1.26.0"}}' }));
    expect(plan.addPytest).toBe(false);
    expect(plan.effectiveManifest?.dependencies.map((d) => d.name)).toEqual(["pytest", "numpy"]);
    expect(codes(plan)).toEqual(["PLAN"]);
  });

  it("falls back to the entry file when there are no tests, trying main, app, run, index in order", () => {
    expect(planRun(py({ files: ["app.py", "run.py"] })).entrypoint).toBe("app.py");
    expect(planRun(py({ files: ["index.py", "run.py"] })).entrypoint).toBe("run.py");
    const plan = planRun(py({ files: ["main.py"] }));
    expect(plan).toMatchObject({ ok: true, mode: "entry", entrypoint: "main.py", install: false });
    expect(plan.effectiveManifest).toEqual({ dependencies: [], executionMode: "run", entrypoint: "main.py" });
  });

  it("installs only when dependencies are declared", () => {
    expect(planRun(py({ files: ["main.py"] })).install).toBe(false);
    expect(planRun(py({ files: ["main.py"], bountiedJson: '{"dependencies":{"requests":"2.x"}}' })).install).toBe(true);
  });

  it("stops with NO_ENTRYPOINT when there is nothing to run", () => {
    const plan = planRun(py({ files: ["README.md", "utils.py"] }));
    expect(plan.ok).toBe(false);
    expect(plan.effectiveManifest).toBeNull();
    expect(codes(plan)).toEqual(["NO_ENTRYPOINT"]);
  });

  it("respects an explicit executionMode", () => {
    const run = planRun(py({ files: ["main.py", "test_a.py"], bountiedJson: '{"executionMode":"run"}' }));
    expect(run).toMatchObject({ ok: true, mode: "entry", entrypoint: "main.py" });
    const needTests = planRun(py({ files: ["main.py"], bountiedJson: '{"executionMode":"test"}' }));
    expect(needTests.ok).toBe(false);
    expect(codes(needTests)).toEqual(["NO_TESTS"]);
  });

  it("uses a declared entrypoint, and flags it when the file is missing", () => {
    expect(planRun(py({ files: ["src/cli.py"], bountiedJson: '{"entrypoint":"./src/cli.py"}' })).entrypoint).toBe("src/cli.py");
    const missing = planRun(py({ files: ["main.py"], bountiedJson: '{"entrypoint":"cli.py"}' }));
    expect(missing.ok).toBe(false);
    expect(codes(missing)).toEqual(["ENTRYPOINT_MISSING"]);
  });

  it("tells the Solver when tests win over a declared entrypoint", () => {
    const plan = planRun(py({ files: ["main.py", "test_main.py"], bountiedJson: '{"entrypoint":"main.py"}' }));
    expect(plan.mode).toBe("tests");
    expect(plan.findings.find((f) => f.code === "PLAN" && f.severity === "info")?.message).toContain("main.py");
  });

  it("warns that requirements.txt is ignored and blocks when its packages aren't declared", () => {
    const plan = planRun(py({ files: ["main.py"], requirementsTxt: "numpy==1.26\nrequests\n" }));
    expect(plan.ok).toBe(false);
    expect(codes(plan)).toEqual(["UNDECLARED_DEPENDENCIES", "REQUIREMENTS_IGNORED"]);
    expect(plan.findings[0].message).toContain("numpy, requests");
  });

  it("only warns when everything in requirements.txt is also declared", () => {
    const plan = planRun(py({ files: ["main.py"], requirementsTxt: "numpy==1.26\n", bountiedJson: '{"dependencies":{"numpy":"1.26"}}' }));
    expect(plan.ok).toBe(true);
    expect(codes(plan)).toEqual(["REQUIREMENTS_IGNORED", "PLAN"]);
  });

  it("doesn't count pytest in requirements.txt as undeclared, because it gets added", () => {
    const plan = planRun(py({ files: ["test_a.py"], requirementsTxt: "pytest\n" }));
    expect(plan.ok).toBe(true);
  });

  it("reports an unreadable bountied.json and stops", () => {
    const bad = planRun(py({ files: ["main.py"], bountiedJson: "{not json" }));
    expect(bad.ok).toBe(false);
    expect(codes(bad)).toEqual(["MANIFEST_INVALID"]);
    const unsafe = planRun(py({ files: ["main.py"], bountiedJson: '{"entrypoint":"a;rm -rf /"}' }));
    expect(codes(unsafe)).toEqual(["MANIFEST_INVALID"]);
  });
});

describe("Node", () => {
  it("runs tests when package.json has a real test script", () => {
    const plan = planRun(node({ files: ["package.json", "index.js"], packageJson: pkg(REAL_TEST) }));
    expect(plan).toMatchObject({ ok: true, mode: "tests", addPytest: false, install: false });
    expect(plan.effectiveManifest).toEqual({ dependencies: [], executionMode: "test" });
    expect(codes(plan)).toEqual(["PLAN"]);
  });

  it("runs the entry file when the test script is npm's placeholder", () => {
    const plan = planRun(node({ files: ["package.json", "index.js"], packageJson: pkg(PLACEHOLDER) }));
    expect(plan).toMatchObject({ ok: true, mode: "entry", entrypoint: "index.js" });
  });

  it("just runs index.js when there is no package.json at all", () => {
    const plan = planRun(node({ files: ["index.js"] }));
    expect(plan).toMatchObject({ ok: true, mode: "entry", entrypoint: "index.js", install: false });
    expect(plan.effectiveManifest).toEqual({ dependencies: [], executionMode: "run", entrypoint: "index.js" });
  });

  it("prefers package.json main over index/main/app, then falls back in order", () => {
    expect(planRun(node({ files: ["package.json", "index.js", "src/server.js"], packageJson: pkg({ main: "src/server.js" }) })).entrypoint).toBe("src/server.js");
    expect(planRun(node({ files: ["package.json", "app.js", "main.js"], packageJson: pkg({}) })).entrypoint).toBe("main.js");
    expect(planRun(node({ files: ["package.json", "app.js"], packageJson: pkg({ main: "gone.js" }) })).entrypoint).toBe("app.js");
  });

  it("a declared bountied.json entrypoint wins over package.json main", () => {
    const plan = planRun(
      node({ files: ["package.json", "a.js", "b.js"], packageJson: pkg({ main: "a.js" }), bountiedJson: '{"entrypoint":"b.js","executionMode":"run"}' })
    );
    expect(plan.entrypoint).toBe("b.js");
  });

  it("stops with NO_ENTRYPOINT when there is no test script and no entry file", () => {
    const plan = planRun(node({ files: ["package.json", "lib/util.js"], packageJson: pkg({}) }));
    expect(plan.ok).toBe(false);
    expect(codes(plan)).toEqual(["NO_ENTRYPOINT"]);
  });

  it("flags test mode without package.json or without a real test script", () => {
    const noPkg = planRun(node({ files: ["index.js"], bountiedJson: '{"executionMode":"test"}' }));
    expect(codes(noPkg)).toEqual(["PACKAGE_JSON_MISSING"]);
    const noScript = planRun(node({ files: ["package.json", "index.js"], packageJson: pkg(PLACEHOLDER), bountiedJson: '{"executionMode":"test"}' }));
    expect(codes(noScript)).toEqual(["NO_TEST_SCRIPT"]);
  });

  it("reports an unreadable package.json", () => {
    const plan = planRun(node({ files: ["package.json", "index.js"], packageJson: "{oops" }));
    expect(plan.ok).toBe(false);
    expect(codes(plan)).toEqual(["PACKAGE_JSON_INVALID"]);
  });

  it("blocks when package.json needs packages but bountied.json declares none", () => {
    const plan = planRun(node({ files: ["package.json", "index.js"], packageJson: pkg({ dependencies: { lodash: "^4" } }) }));
    expect(plan.ok).toBe(false);
    expect(codes(plan)).toEqual(["UNDECLARED_DEPENDENCIES"]);
  });

  it("does not block entry mode over dev-only dependencies, but does when tests need them", () => {
    const dev = { devDependencies: { eslint: "^9", jest: "^29" } };
    expect(planRun(node({ files: ["package.json", "index.js"], packageJson: pkg(dev) })).ok).toBe(true);
    const tests = planRun(node({ files: ["package.json"], packageJson: pkg({ ...REAL_TEST, ...dev }) }));
    expect(tests.ok).toBe(false);
    expect(codes(tests)).toEqual(["UNDECLARED_DEPENDENCIES"]);
  });

  it("passes when at least one dependency is declared, because npm installs the whole package.json", () => {
    const plan = planRun(
      node({ files: ["package.json"], packageJson: pkg({ ...REAL_TEST, dependencies: { lodash: "^4" }, devDependencies: { jest: "^29" } }), bountiedJson: '{"dependencies":{"jest":"29.7.0"}}' })
    );
    expect(plan.ok).toBe(true);
    expect(plan.install).toBe(true);
  });

  it("warns about a TypeScript entry file", () => {
    const plan = planRun(node({ files: ["src/index.ts"], bountiedJson: '{"entrypoint":"src/index.ts","executionMode":"run"}' }));
    expect(plan.ok).toBe(true);
    expect(codes(plan)).toEqual(["TS_ENTRYPOINT", "PLAN"]);
  });
});

describe("safety", () => {
  it("never puts a path that isn't in the repo into the manifest", () => {
    const plan = planRun(py({ files: ["main.py"], bountiedJson: '{"entrypoint":"other.py"}' }));
    expect(plan.effectiveManifest).toBeNull();
  });

  it("refuses an existing file whose name has shell metacharacters", () => {
    const plan = planRun(py({ files: ["main.py;rm"], bountiedJson: null }));
    // Not a candidate name, so nothing is chosen at all.
    expect(plan.ok).toBe(false);
    expect(plan.effectiveManifest).toBeNull();
  });

  it("puts errors before warnings before info", () => {
    const plan = planRun(py({ files: ["main.py"], requirementsTxt: "numpy\n" }));
    expect(plan.findings.map((f) => f.severity)).toEqual(["error", "warning"]);
    for (const f of plan.findings) expect(f.docsUrl).toBe(`/docs/sandbox#${f.code}`);
  });
});
