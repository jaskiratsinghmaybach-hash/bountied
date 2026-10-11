import { sandboxDocsUrl } from "./findings";

/**
 * Turns "the run ended like this" into a reason a Solver can act on. Pure and
 * deterministic: it reads the exit code and the program's own output, so every
 * rule is unit-tested.
 *
 * This is for the SOLVER who ran the test. The output it reads is the Solver's
 * own program output and the hint may quote a module name from it, so this
 * result must never be shown to a Giver (zero-source).
 *
 * status is what the run is recorded as:
 *   ERROR  - the platform or the setup failed before the Solver's code could be
 *            judged. Always refunded and never uses the free test.
 *   FAILED - the Solver's code, tests or declared dependencies failed. Charged.
 */

export const DIAGNOSIS_CODES = [
  "PLATFORM_ERROR",
  "SETUP_PROBLEM",
  "DEP_VERSION_NOT_FOUND",
  "DEPENDENCY_INSTALL_FAILED",
  "TIMEOUT",
  "PY_MODULE_NOT_FOUND",
  "PY_NO_TESTS_COLLECTED",
  "PY_SYNTAX_ERROR",
  "NODE_MODULE_NOT_FOUND",
  "NODE_FILE_NOT_FOUND",
  "NODE_NO_PACKAGE_JSON",
  "NODE_NO_TEST_SCRIPT",
  "NODE_SYNTAX_ERROR",
  "TESTS_FAILED",
  "PROGRAM_FAILED",
] as const;
export type DiagnosisCode = (typeof DIAGNOSIS_CODES)[number];

/** How the runner says the run ended before (or instead of) producing an exit code. */
export type FailureKind = "clone" | "dependency-install" | "infra" | "setup" | "timeout";

export type DiagnoseInput = {
  runtime: "PYTHON" | "NODE";
  mode: "tests" | "entry" | null;
  failureKind?: FailureKind | null;
  exitCode?: number | null;
  /** The program's (or the failed install's) combined stdout and stderr. */
  output?: string | null;
};

export type Diagnosis = {
  code: DiagnosisCode;
  title: string;
  hint: string;
  docsUrl: string;
  status: "FAILED" | "ERROR";
  /** True when the Solver is given their money back (status ERROR). */
  refundable: boolean;
};

const MAX_SCAN_CHARS = 60_000;

function result(code: DiagnosisCode, title: string, hint: string, status: "FAILED" | "ERROR"): Diagnosis {
  return { code, title, hint, docsUrl: sandboxDocsUrl(code), status, refundable: status === "ERROR" };
}

/** A name pulled from untrusted output, reduced to characters that are safe to show. */
function safeName(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9._@/-]/g, "").slice(0, 60);
  return cleaned || "that module";
}

// Network trouble while installing is the platform's or the registry's fault, not the Solver's.
const NETWORK_TROUBLE =
  /ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|Temporary failure in name resolution|Network is unreachable|Read timed out|Connection timed out|\b50[234] (Bad Gateway|Service Unavailable|Gateway)/i;

const DEP_VERSION =
  /No matching distribution found|Could not find a version that satisfies the requirement|No matching version found for|npm error code ETARGET|npm ERR! code ETARGET|notarget/i;

export function diagnose(input: DiagnoseInput): Diagnosis | null {
  const { runtime, mode, failureKind } = input;
  const output = (input.output ?? "").slice(0, MAX_SCAN_CHARS);

  // 1. Ended without a result.
  if (failureKind === "infra") {
    return result(
      "PLATFORM_ERROR",
      "Bountied had a problem",
      "This wasn't caused by your code. You were not charged. Try again in a minute.",
      "ERROR"
    );
  }
  if (failureKind === "clone" || failureKind === "setup") {
    return result(
      "SETUP_PROBLEM",
      "Your repository couldn't be set up",
      "Bountied couldn't fetch your repository. Check that your GitHub account is still connected in Settings and still has access to this repo, and that the commit was pushed. You were not charged.",
      "ERROR"
    );
  }
  if (failureKind === "timeout") {
    return result(
      "TIMEOUT",
      "The run took too long",
      "Your program didn't finish in time and was stopped. Look for an infinite loop, a prompt waiting for input, or a server that never exits. A program that serves forever can't be tested here.",
      "FAILED"
    );
  }
  if (failureKind === "dependency-install") {
    if (NETWORK_TROUBLE.test(output)) {
      return result(
        "PLATFORM_ERROR",
        "The package registry couldn't be reached",
        "Installing your dependencies hit a network problem that isn't caused by your code. You were not charged. Try again in a minute.",
        "ERROR"
      );
    }
    if (DEP_VERSION.test(output)) {
      return result(
        "DEP_VERSION_NOT_FOUND",
        "A dependency version doesn't exist",
        "One of the versions in bountied.json can't be found. Check the package name and the version number, or remove the version to take the latest.",
        "FAILED"
      );
    }
    return result(
      "DEPENDENCY_INSTALL_FAILED",
      "Installing dependencies failed",
      "A package in bountied.json couldn't be installed. Check the names and versions. Packages that need system libraries may fail here.",
      "FAILED"
    );
  }

  // 2. The program ran. Exit 0 is success.
  if (input.exitCode === 0) return null;
  const exitCode = input.exitCode ?? null;

  if (runtime === "PYTHON") {
    const missing = /ModuleNotFoundError: No module named ['"]([^'"]+)['"]/.exec(output);
    if (missing) {
      const name = safeName(missing[1].split(".")[0]);
      return result(
        "PY_MODULE_NOT_FOUND",
        `Python can't find "${name}"`,
        `Add "${name}" to dependencies in bountied.json. If it's a file of your own, check that it's committed and that the import path matches the folder layout. Note that a package's install name can differ from its import name (for example, scikit-learn is imported as sklearn).`,
        "FAILED"
      );
    }
    if (mode === "tests" && (exitCode === 5 || /no tests ran|collected 0 items/i.test(output))) {
      return result(
        "PY_NO_TESTS_COLLECTED",
        "pytest found no tests",
        "Name test files test_*.py or *_test.py, and test functions test_*. Files in a tests/ folder are found too.",
        "FAILED"
      );
    }
    if (/\b(SyntaxError|IndentationError|TabError)\b/.test(output)) {
      return result(
        "PY_SYNTAX_ERROR",
        "Python found a syntax error",
        "A file has invalid Python syntax. Run python -m py_compile on your files locally, and check indentation and unclosed brackets.",
        "FAILED"
      );
    }
  } else {
    if (/Missing script: "test"/i.test(output)) {
      return result(
        "NODE_NO_TEST_SCRIPT",
        "No test script in package.json",
        'Add a "test" script to package.json, or set "executionMode": "run" in bountied.json to run your entry file.',
        "FAILED"
      );
    }
    if (/Could not read package\.json|npm (error|ERR!) (code )?ENOENT[\s\S]{0,200}package\.json|ENOENT[^\n]*package\.json/i.test(output)) {
      return result(
        "NODE_NO_PACKAGE_JSON",
        "package.json not found",
        "npm needs a package.json in the repo root to run tests. Add one, or set \"executionMode\": \"run\" in bountied.json to run your entry file.",
        "FAILED"
      );
    }
    const cannotFind = /Cannot find module ['"]([^'"]+)['"]/.exec(output);
    if (cannotFind) {
      const spec = cannotFind[1];
      if (spec.startsWith(".") || spec.startsWith("/")) {
        return result(
          "NODE_FILE_NOT_FOUND",
          "Node can't find a file",
          "A file that your program loads (or the entry file itself) doesn't exist at that path. Check the spelling and capital letters, and make sure it's committed and pushed.",
          "FAILED"
        );
      }
      const name = safeName(spec);
      return result(
        "NODE_MODULE_NOT_FOUND",
        `Node can't find "${name}"`,
        `Add "${name}" to dependencies in bountied.json so it gets installed.`,
        "FAILED"
      );
    }
    const notFound = /(?:sh|bash): (?:\d+: )?([A-Za-z0-9._@/-]+): (?:command )?not found/.exec(output);
    if (notFound) {
      const name = safeName(notFound[1]);
      return result(
        "NODE_MODULE_NOT_FOUND",
        `"${name}" isn't installed`,
        `Your test script runs "${name}", but it isn't installed. Add it to dependencies in bountied.json.`,
        "FAILED"
      );
    }
    if (/\bSyntaxError\b/.test(output)) {
      return result(
        "NODE_SYNTAX_ERROR",
        "Node found a syntax error",
        "A file has invalid JavaScript syntax. Run node --check on your files locally. If you use import/export, make sure package.json has \"type\": \"module\" (or use require).",
        "FAILED"
      );
    }
  }

  // 3. Ran and exited non-zero for a reason we don't recognize.
  if (mode === "tests") {
    return result(
      "TESTS_FAILED",
      "Your tests failed",
      "The tests ran, and at least one failed. Run them locally to see which, then fix and test again.",
      "FAILED"
    );
  }
  return result(
    "PROGRAM_FAILED",
    exitCode === null ? "Your program failed" : `Your program exited with code ${exitCode}`,
    "Your program ended with an error. Run it locally with the same entry file to reproduce it.",
    "FAILED"
  );
}
