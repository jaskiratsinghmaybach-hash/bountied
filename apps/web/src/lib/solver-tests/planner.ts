import { parseBountiedManifest, validateEntrypoint } from "@/lib/sandbox/bountied-manifest";
import type { BountiedManifest, ManifestDependency } from "@/lib/sandbox/bountied-manifest";
import { makeFinding, sortFindings } from "./findings";
import type { Finding } from "./findings";

/**
 * The free preflight: looks at a Solver's repo (a file list plus three small
 * files) and decides what the sandbox will run, without cloning anything or
 * spending any money. Pure: no I/O, so every rule is unit-tested.
 *
 * Safety: this module never produces a command. Its output is an effective
 * BountiedManifest (dependencies, a validated entrypoint, executionMode
 * "test" or "run"), which the runtime adapter in lib/sandbox/runtimes.ts turns
 * into one of its FIXED command templates. Everything in the snapshot is
 * Solver-controlled, so the only value taken from it into that manifest is an
 * entrypoint path, and that path must be a file that really exists in the repo
 * and pass validateEntrypoint().
 *
 * Smart default (product decision): with no executionMode in bountied.json,
 *   - a real test suite exists  -> run the tests;
 *   - otherwise                 -> run the entry file.
 * An explicit executionMode in bountied.json is respected.
 */

export type PlanRuntime = "PYTHON" | "NODE";

export type RepoSnapshot = {
  runtime: PlanRuntime;
  /** Every file path in the repo, relative to the root, forward slashes. */
  files: string[];
  /** Contents of bountied.json at the repo root, or null if absent. */
  bountiedJson: string | null;
  /** Contents of package.json at the repo root, or null if absent. */
  packageJson: string | null;
  /** Contents of requirements.txt at the repo root, or null if absent. */
  requirementsTxt: string | null;
};

export type RunMode = "tests" | "entry";

export type RunPlan = {
  /** False when any finding is an error: the Solver should fix it before paying for a run. */
  ok: boolean;
  /** Null when the plan could not be made. */
  mode: RunMode | null;
  /** The file that will run, when mode is "entry". */
  entrypoint: string | null;
  /** pytest was not declared, so the plan adds it. */
  addPytest: boolean;
  /** Whether the install step will run. */
  install: boolean;
  /** What the runner should use. Present only when ok. Feeds the fixed command templates. */
  effectiveManifest: BountiedManifest | null;
  findings: Finding[];
};

const PYTHON_ENTRY_CANDIDATES = ["main.py", "app.py", "run.py", "index.py"];
const NODE_ENTRY_CANDIDATES = ["index.js", "main.js", "app.js"];
/** Directories that hold other people's code, never the Solver's own tests. */
const VENDOR_SEGMENTS = new Set(["node_modules", "venv", ".venv", "env", "site-packages", "__pycache__", ".git", ".tox"]);

/** Same normalization lib/sandbox/bountied-manifest.ts applies to package names. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[-_.]+/g, "-");
}

function cleanPath(path: string): string {
  return path.replace(/^\.\//, "");
}

function ownFiles(files: string[]): string[] {
  return files.filter((f) => !f.split("/").some((seg) => VENDOR_SEGMENTS.has(seg)));
}

/** Python test files: test_*.py, *_test.py, or any .py file inside a tests/ directory. */
export function findPythonTests(files: string[]): string[] {
  return ownFiles(files).filter((f) => {
    if (!f.endsWith(".py")) return false;
    const segments = f.split("/");
    const base = segments[segments.length - 1];
    if (base.startsWith("test_") || base.endsWith("_test.py")) return true;
    return segments.slice(0, -1).includes("tests");
  });
}

/** True when a package.json scripts.test is a real command, not npm's generated placeholder. */
export function hasRealNodeTestScript(pkg: { scripts?: Record<string, unknown> } | null): boolean {
  const script = pkg?.scripts?.test;
  if (typeof script !== "string" || script.trim().length === 0) return false;
  if (/no test specified/i.test(script)) return false;
  if (/^\s*exit\s+1\s*$/.test(script)) return false;
  return true;
}

/** Package names from a requirements.txt (comments, options, URLs and extras stripped). */
export function parseRequirementNames(text: string): string[] {
  const names = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#") || line.startsWith("-") || line.includes("://") || line.startsWith("git+")) continue;
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(line);
    if (match) names.add(normalizeName(match[1]));
  }
  return Array.from(names);
}

type ParsedPackageJson = { ok: boolean; pkg: Record<string, unknown> | null };

function parsePackageJson(text: string | null): ParsedPackageJson {
  if (text === null) return { ok: true, pkg: null };
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, pkg: null };
    return { ok: true, pkg: value as Record<string, unknown> };
  } catch {
    return { ok: false, pkg: null };
  }
}

function depNames(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).map(normalizeName);
}

function listForMessage(names: string[], max = 8): string {
  const shown = names.slice(0, max).join(", ");
  return names.length > max ? `${shown} and ${names.length - max} more` : shown;
}

export function planRun(snapshot: RepoSnapshot): RunPlan {
  const findings: Finding[] = [];
  const fail = (): RunPlan => ({
    ok: false,
    mode: null,
    entrypoint: null,
    addPytest: false,
    install: false,
    effectiveManifest: null,
    findings: sortFindings(findings),
  });

  const fileSet = new Set(snapshot.files.map(cleanPath));
  const isPython = snapshot.runtime === "PYTHON";

  // 1. bountied.json. An unreadable manifest stops everything: nothing else is trustworthy.
  let manifest: BountiedManifest | null = null;
  if (snapshot.bountiedJson !== null) {
    const parsed = parseBountiedManifest(snapshot.bountiedJson);
    if (parsed.parseError || !parsed.manifest) {
      findings.push(
        makeFinding(
          "MANIFEST_INVALID",
          "error",
          parsed.parseError ?? "bountied.json is not valid.",
          "Fix bountied.json (it must be a JSON object) or delete it if your project has no dependencies."
        )
      );
      return fail();
    }
    manifest = parsed.manifest;
  }
  const declared: ManifestDependency[] = manifest?.dependencies ?? [];
  const declaredNames = new Set(declared.map((d) => normalizeName(d.name)));

  // 2. package.json (Node only matters, but parse errors are worth reporting there).
  const pkgParse = parsePackageJson(snapshot.packageJson);
  if (!isPython && !pkgParse.ok) {
    findings.push(
      makeFinding(
        "PACKAGE_JSON_INVALID",
        "error",
        "package.json is not valid JSON.",
        "Fix the syntax in package.json (a stray comma is the usual cause), then test again."
      )
    );
    return fail();
  }
  const pkg = pkgParse.pkg;

  // 3. Which mode?
  const pyTests = isPython ? findPythonTests(snapshot.files) : [];
  const nodeTestScript = !isPython && hasRealNodeTestScript(pkg as { scripts?: Record<string, unknown> } | null);
  const hasTests = isPython ? pyTests.length > 0 : nodeTestScript;
  const explicitMode = manifest?.executionMode; // "test" | "build-test" | "run" | undefined

  let mode: RunMode | null = null;
  if (explicitMode === "run") {
    mode = "entry";
  } else if (explicitMode === "test" || explicitMode === "build-test") {
    mode = "tests";
    if (!hasTests) {
      if (isPython) {
        findings.push(
          makeFinding(
            "NO_TESTS",
            "error",
            'bountied.json says executionMode is "test", but no test files were found.',
            'Add test files named test_*.py or *_test.py (or put them in a tests/ folder), or set "executionMode": "run" to run your entry file instead.'
          )
        );
      } else if (!pkg) {
        findings.push(
          makeFinding(
            "PACKAGE_JSON_MISSING",
            "error",
            'bountied.json says executionMode is "test", but the repo has no package.json.',
            'Add a package.json with a "test" script, or set "executionMode": "run" to run your entry file instead.'
          )
        );
      } else {
        findings.push(
          makeFinding(
            "NO_TEST_SCRIPT",
            "error",
            'bountied.json says executionMode is "test", but package.json has no real "test" script.',
            'Add a "test" script to package.json (the default "no test specified" placeholder does not count), or set "executionMode": "run".'
          )
        );
      }
      return fail();
    }
  } else {
    mode = hasTests ? "tests" : "entry";
  }

  // 4. Entry file, when that is what will run.
  let entrypoint: string | null = null;
  if (mode === "entry") {
    const declaredEntry = manifest?.entrypoint ? cleanPath(manifest.entrypoint) : null;
    if (declaredEntry) {
      if (!fileSet.has(declaredEntry)) {
        findings.push(
          makeFinding(
            "ENTRYPOINT_MISSING",
            "error",
            `bountied.json names an entry file that is not in the repository (${declaredEntry}).`,
            "Check the spelling and the folder, make sure the file is committed and pushed, or remove the entrypoint to let Bountied pick one."
          )
        );
        return fail();
      }
      entrypoint = declaredEntry;
    } else {
      const candidates: string[] = [];
      if (!isPython) {
        const main = typeof pkg?.main === "string" ? cleanPath(pkg.main) : null;
        if (main && validateEntrypoint(main).ok) candidates.push(main);
        candidates.push(...NODE_ENTRY_CANDIDATES);
      } else {
        candidates.push(...PYTHON_ENTRY_CANDIDATES);
      }
      entrypoint = candidates.find((c) => fileSet.has(c)) ?? null;
      if (!entrypoint) {
        findings.push(
          makeFinding(
            "NO_ENTRYPOINT",
            "error",
            isPython
              ? "No tests and no entry file were found, so there is nothing to run."
              : "No test script and no entry file were found, so there is nothing to run.",
            isPython
              ? 'Add tests (test_*.py), or a main.py, app.py, run.py or index.py in the repo root, or set "entrypoint" in bountied.json.'
              : 'Add a "test" script to package.json, or an index.js, main.js or app.js in the repo root, or set "entrypoint" in bountied.json.'
          )
        );
        return fail();
      }
    }

    const checked = validateEntrypoint(entrypoint);
    if (!checked.ok || checked.value === undefined) {
      findings.push(
        makeFinding(
          "ENTRYPOINT_MISSING",
          "error",
          "The entry file path contains characters Bountied can't run safely.",
          "Rename the file so its path uses only letters, digits, dots, dashes, underscores and slashes."
        )
      );
      return fail();
    }

    if (/\.(ts|tsx|mts|cts)$/.test(entrypoint)) {
      findings.push(
        makeFinding(
          "TS_ENTRYPOINT",
          "warning",
          `The entry file is TypeScript (${entrypoint}). Node can't run .ts files directly.`,
          "Compile it to JavaScript and commit the output, or point entrypoint at the compiled .js file."
        )
      );
    }
  } else if (manifest?.entrypoint && !explicitMode) {
    findings.push(
      makeFinding(
        "PLAN",
        "info",
        `Your tests will run, not ${manifest.entrypoint}, because a test suite was found.`,
        'To run your entry file instead, set "executionMode": "run" in bountied.json.'
      )
    );
  }

  // 5. Dependencies that the platform will not install.
  if (isPython && snapshot.requirementsTxt !== null) {
    findings.push(
      makeFinding(
        "REQUIREMENTS_IGNORED",
        "warning",
        "Bountied does not read requirements.txt. Dependencies come only from bountied.json.",
        "List every package your project needs under dependencies in bountied.json."
      )
    );
    const needed = parseRequirementNames(snapshot.requirementsTxt);
    const missing = needed.filter((n) => !declaredNames.has(n) && !(mode === "tests" && n === "pytest"));
    if (missing.length > 0) {
      findings.push(
        makeFinding(
          "UNDECLARED_DEPENDENCIES",
          "error",
          `These packages are in requirements.txt but not in bountied.json, so they won't be installed: ${listForMessage(missing)}.`,
          "Add them under dependencies in bountied.json."
        )
      );
    }
  }
  if (!isPython && pkg && declared.length === 0) {
    // With nothing declared the install step is skipped entirely, so package.json's
    // dependencies would never be installed. (With even one package declared, npm installs
    // the whole package.json tree along with it.)
    const runtimeDeps = depNames(pkg.dependencies);
    const devDeps = mode === "tests" ? depNames(pkg.devDependencies) : [];
    const needed = Array.from(new Set([...runtimeDeps, ...devDeps]));
    if (needed.length > 0) {
      findings.push(
        makeFinding(
          "UNDECLARED_DEPENDENCIES",
          "error",
          `package.json lists dependencies (${listForMessage(needed)}) but bountied.json declares none, so nothing will be installed.`,
          "List your dependencies under dependencies in bountied.json. Listing them all is the safest option."
        )
      );
    }
  }

  if (findings.some((f) => f.severity === "error")) return fail();

  // 6. The effective manifest the runner will use.
  const addPytest = isPython && mode === "tests" && !declaredNames.has("pytest");
  const dependencies: ManifestDependency[] = addPytest ? [...declared, { name: "pytest", version: null }] : declared;
  if (addPytest) {
    findings.push(
      makeFinding(
        "PYTEST_ADDED",
        "info",
        "pytest isn't in bountied.json, so Bountied installs it for this run.",
        'Add "pytest" to dependencies in bountied.json to make this explicit.'
      )
    );
  }

  const plan =
    mode === "tests"
      ? isPython
        ? "Will run your tests with pytest."
        : "Will run your tests with npm test."
      : `Will run ${entrypoint}.`;
  findings.push(makeFinding("PLAN", "info", plan, "Run the test to see the result."));

  const effectiveManifest: BountiedManifest = {
    dependencies,
    executionMode: mode === "tests" ? "test" : "run",
    ...(mode === "entry" && entrypoint ? { entrypoint } : {}),
  };

  return {
    ok: true,
    mode,
    entrypoint,
    addPytest,
    install: dependencies.length > 0,
    effectiveManifest,
    findings: sortFindings(findings),
  };
}
