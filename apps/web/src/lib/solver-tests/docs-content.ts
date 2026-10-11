import { FINDING_CODES, FINDING_TITLES } from "./findings";
import type { FindingCode, FindingSeverity } from "./findings";
import { DIAGNOSIS_CODES } from "./diagnose";
import type { DiagnosisCode } from "./diagnose";

/**
 * The words behind /docs/sandbox: one entry per finding code (the free check
 * before a run) and per diagnosis code (what a finished run tells the Solver).
 * Every link the product shows ends in /docs/sandbox#<CODE>, and the page gives
 * each entry that id, so a code without an entry here fails the typecheck (the
 * Record is keyed by every code) and the test in docs-content.test.ts.
 *
 * Written for the Solver who owns the repo. Nothing here is shown to a Giver.
 */

/** What the Solver's wallet does for this outcome. */
export type DocMoney = "free-check" | "charged" | "not-charged";

export type DocEntry = {
  title: string;
  /** What it means. */
  what: string;
  /** How to fix it, in order. */
  steps: string[];
  money: DocMoney;
  /** Present for check findings only. */
  severity?: FindingSeverity;
};

const check = (severity: FindingSeverity, what: string, steps: string[]): Omit<DocEntry, "title"> => ({
  severity,
  what,
  steps,
  money: "free-check",
});

const FINDING_DOCS: Record<FindingCode, Omit<DocEntry, "title">> = {
  MANIFEST_INVALID: check(
    "error",
    "bountied.json exists in your repo root but Bountied can't read it, so it can't tell what to install or run.",
    [
      "Open bountied.json and make sure it is one valid JSON object (a stray comma or missing quote is the usual cause).",
      "List packages under \"dependencies\", for example the example at the top of the manifest section below.",
      "If your project has no dependencies, you can delete the file instead.",
      "Commit, push, and run the free check again.",
    ]
  ),
  NO_TESTS: check(
    "error",
    "bountied.json says \"executionMode\": \"test\", but no test files were found, so there is nothing to run.",
    [
      "Add test files named test_*.py or *_test.py, or put them in a tests/ folder.",
      "Or set \"executionMode\": \"run\" in bountied.json to run your entry file instead.",
      "Commit, push, and check again.",
    ]
  ),
  NO_ENTRYPOINT: check(
    "error",
    "No tests and no entry file were found, so Bountied has nothing to run.",
    [
      "Add tests (Python: test_*.py, *_test.py or a tests/ folder; Node: a real \"test\" script in package.json).",
      "Or add an entry file: Python looks for main.py, app.py, run.py or index.py; Node uses the entrypoint in bountied.json, then \"main\" in package.json, then index.js, main.js or app.js.",
      "You can also name the file yourself with \"entrypoint\" in bountied.json.",
    ]
  ),
  ENTRYPOINT_MISSING: check(
    "error",
    "The entry file named in bountied.json isn't in your repository, or its path contains characters Bountied can't run safely.",
    [
      "Check the spelling, the folder and the capital letters of the \"entrypoint\" path.",
      "Make sure the file is committed and pushed to your default branch.",
      "Paths may use only letters, digits, dots, dashes, underscores and slashes.",
      "Or remove \"entrypoint\" and let Bountied pick one.",
    ]
  ),
  PACKAGE_JSON_MISSING: check(
    "error",
    "bountied.json asks to run your tests, but a Node project needs a package.json for that and the repo has none.",
    [
      "Add a package.json with a \"test\" script.",
      "Or set \"executionMode\": \"run\" in bountied.json to run your entry file instead.",
    ]
  ),
  NO_TEST_SCRIPT: check(
    "error",
    "package.json has no real \"test\" script. The default \"no test specified\" placeholder doesn't count.",
    [
      "Add a \"test\" script to package.json that runs your tests.",
      "Or set \"executionMode\": \"run\" in bountied.json to run your entry file instead.",
    ]
  ),
  PACKAGE_JSON_INVALID: check(
    "error",
    "package.json isn't valid JSON, so Bountied can't tell what your project needs.",
    ["Fix the syntax (a stray comma is the usual cause), commit, push, and check again."]
  ),
  UNDECLARED_DEPENDENCIES: check(
    "error",
    "Your project lists packages somewhere else (requirements.txt or package.json) that bountied.json doesn't declare. Only bountied.json is used to install, so they would be missing at run time.",
    [
      "Add every package your project needs under \"dependencies\" in bountied.json.",
      "Listing all of them is the safest choice.",
      "Commit, push, and check again.",
    ]
  ),
  DEPENDENCY_POLICY: check(
    "error",
    "The Giver of this bounty restricted which packages a solution may use, and your bountied.json breaks that rule. The same rule is applied when you submit, so it is checked now, before you pay.",
    [
      "Read the message on the finding: it names the package or the limit that was exceeded.",
      "Change the dependencies in bountied.json so they follow this bounty's rules.",
      "Commit, push, and check again.",
    ]
  ),
  REQUIREMENTS_IGNORED: check(
    "warning",
    "Bountied doesn't read requirements.txt. Dependencies come only from bountied.json.",
    ["List every package your project needs under \"dependencies\" in bountied.json."]
  ),
  TS_ENTRYPOINT: check(
    "warning",
    "Your entry file is TypeScript, and Node can't run .ts files directly, so the run will probably fail.",
    ["Compile it to JavaScript and commit the output, or point \"entrypoint\" at the compiled .js file."]
  ),
  PLAN: check(
    "info",
    "A plain statement of what Bountied is about to do: run your tests or your entry file. It isn't a problem.",
    ["Nothing to fix. To change what runs, set \"executionMode\" in bountied.json."]
  ),
  PYTEST_ADDED: check(
    "info",
    "Your tests will run with pytest, and pytest wasn't declared, so Bountied installs it for this run.",
    ["Nothing to fix. Add \"pytest\" to dependencies in bountied.json to make it explicit."]
  ),
};

const run = (money: DocMoney, title: string, what: string, steps: string[]): DocEntry => ({ title, what, steps, money });

const DIAGNOSIS_DOCS: Record<DiagnosisCode, DocEntry> = {
  PLATFORM_ERROR: run(
    "not-charged",
    "Bountied had a problem",
    "The run failed because of Bountied or a service it depends on (for example the package registry couldn't be reached), not because of your code.",
    ["You were not charged, and this doesn't use your free test.", "Wait a minute and run the test again."]
  ),
  SETUP_PROBLEM: run(
    "not-charged",
    "Your repository couldn't be set up",
    "Bountied couldn't fetch your repository at the commit it checked, or the repository changed between the check and the run.",
    [
      "You were not charged, and this doesn't use your free test.",
      "Check that your GitHub account is still connected in Settings and still has access to the repo.",
      "Make sure the commit is pushed, then run the free check and test again.",
    ]
  ),
  DEP_VERSION_NOT_FOUND: run(
    "charged",
    "A dependency version doesn't exist",
    "Installing failed because a version listed in bountied.json can't be found.",
    ["Check the package name and the version number.", "Or remove the version to take the latest.", "Push and test again."]
  ),
  DEPENDENCY_INSTALL_FAILED: run(
    "charged",
    "Installing dependencies failed",
    "A package in bountied.json couldn't be installed. Packages that need system libraries may fail in the sandbox.",
    ["Check the names and the versions.", "Remove packages you don't need.", "Push and test again."]
  ),
  TIMEOUT: run(
    "charged",
    "The run took too long",
    "Your program didn't finish in time and was stopped. Each run has a short time limit.",
    [
      "Look for an infinite loop or a prompt waiting for input.",
      "A program that serves forever, such as a web server, can't be tested here.",
      "Make your tests finish quickly, then test again.",
    ]
  ),
  PY_MODULE_NOT_FOUND: run(
    "charged",
    "Python can't find a module",
    "Your code imports a module that isn't installed or isn't where the import expects it.",
    [
      "If it is a package, add it to \"dependencies\" in bountied.json. Its install name can differ from its import name (scikit-learn is imported as sklearn).",
      "If it is your own file, check that it is committed and that the import path matches your folders.",
    ]
  ),
  PY_NO_TESTS_COLLECTED: run(
    "charged",
    "pytest found no tests",
    "pytest ran but collected nothing.",
    [
      "Name test files test_*.py or *_test.py, and test functions test_*.",
      "Files in a tests/ folder are found too.",
      "Or set \"executionMode\": \"run\" to run your entry file instead.",
    ]
  ),
  PY_SYNTAX_ERROR: run(
    "charged",
    "Python found a syntax error",
    "A file has invalid Python syntax.",
    ["Run python -m py_compile on your files locally.", "Check indentation and unclosed brackets."]
  ),
  NODE_MODULE_NOT_FOUND: run(
    "charged",
    "Node can't find a package or command",
    "Your code (or your test script) uses a package or command that isn't installed.",
    ["Add it to \"dependencies\" in bountied.json so it gets installed.", "Push and test again."]
  ),
  NODE_FILE_NOT_FOUND: run(
    "charged",
    "Node can't find a file",
    "A file your program loads, or the entry file itself, doesn't exist at that path.",
    ["Check the spelling and the capital letters.", "Make sure the file is committed and pushed."]
  ),
  NODE_NO_PACKAGE_JSON: run(
    "charged",
    "package.json not found",
    "npm needs a package.json in the repo root to run tests.",
    ["Add a package.json.", "Or set \"executionMode\": \"run\" in bountied.json to run your entry file."]
  ),
  NODE_NO_TEST_SCRIPT: run(
    "charged",
    "No test script in package.json",
    "package.json has no \"test\" script.",
    ["Add a \"test\" script to package.json.", "Or set \"executionMode\": \"run\" in bountied.json to run your entry file."]
  ),
  NODE_SYNTAX_ERROR: run(
    "charged",
    "Node found a syntax error",
    "A file has invalid JavaScript syntax.",
    [
      "Run node --check on your files locally.",
      "If you use import/export, set \"type\": \"module\" in package.json, or use require.",
    ]
  ),
  TESTS_FAILED: run(
    "charged",
    "Your tests failed",
    "Your tests ran, and at least one failed. This is the result the test exists to give you.",
    ["Run the tests locally to see which one failed.", "Fix it, push, and test again."]
  ),
  PROGRAM_FAILED: run(
    "charged",
    "Your program failed",
    "Your program ran and ended with a non-zero exit code.",
    ["Run it locally with the same entry file to reproduce the error.", "Fix it, push, and test again."]
  ),
};

/** The full set, keyed by the code used in the /docs/sandbox#<CODE> anchor. */
export const SANDBOX_DOCS: Record<FindingCode | DiagnosisCode, DocEntry> = {
  ...(Object.fromEntries(
    FINDING_CODES.map((code) => [code, { title: FINDING_TITLES[code], ...FINDING_DOCS[code] }])
  ) as Record<FindingCode, DocEntry>),
  ...DIAGNOSIS_DOCS,
};

/** Codes grouped the way the page lists them. */
export const FINDING_GROUPS: Array<{ severity: FindingSeverity; heading: string; codes: FindingCode[] }> = [
  { severity: "error", heading: "Problems to fix before you can run", codes: FINDING_CODES.filter((c) => FINDING_DOCS[c].severity === "error") },
  { severity: "warning", heading: "Warnings: the run may still work", codes: FINDING_CODES.filter((c) => FINDING_DOCS[c].severity === "warning") },
  { severity: "info", heading: "Information: what Bountied will do", codes: FINDING_CODES.filter((c) => FINDING_DOCS[c].severity === "info") },
];

export const RESULT_GROUPS: Array<{ heading: string; codes: DiagnosisCode[] }> = [
  { heading: "Not caused by your code: refunded", codes: DIAGNOSIS_CODES.filter((c) => DIAGNOSIS_DOCS[c].money === "not-charged") },
  { heading: "Your project's result: charged", codes: DIAGNOSIS_CODES.filter((c) => DIAGNOSIS_DOCS[c].money === "charged") },
];

/** The manifest the page shows. docs-content.test.ts runs it through the real parser. */
export const EXAMPLE_MANIFEST = `{
  "dependencies": {
    "requests": "2.31.0",
    "pytest": ""
  },
  "executionMode": "test"
}`;
