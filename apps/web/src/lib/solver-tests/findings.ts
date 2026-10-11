/**
 * Shared vocabulary for Solver-side sandbox tests: the findings the free
 * preflight reports BEFORE any money is spent, and the doc anchors both the
 * preflight and the post-run diagnosis link to (/docs/sandbox#<CODE>).
 *
 * Findings are written for the Solver who owns the repo. They describe the
 * Solver's own files, so they must never be shown to a Giver.
 */

export type FindingSeverity = "error" | "warning" | "info";

export const FINDING_CODES = [
  // errors: the run would fail, so the Solver is stopped before paying
  "MANIFEST_INVALID",
  "NO_TESTS",
  "NO_ENTRYPOINT",
  "ENTRYPOINT_MISSING",
  "PACKAGE_JSON_MISSING",
  "NO_TEST_SCRIPT",
  "PACKAGE_JSON_INVALID",
  "UNDECLARED_DEPENDENCIES",
  "DEPENDENCY_POLICY",
  // warnings: the run may still work
  "REQUIREMENTS_IGNORED",
  "TS_ENTRYPOINT",
  // info: what Bountied is about to do
  "PLAN",
  "PYTEST_ADDED",
] as const;
export type FindingCode = (typeof FINDING_CODES)[number];

export type Finding = {
  code: FindingCode;
  severity: FindingSeverity;
  title: string;
  /** What Bountied found. */
  message: string;
  /** A concrete next step. */
  fix: string;
  docsUrl: string;
};

const TITLES: Record<FindingCode, string> = {
  MANIFEST_INVALID: "bountied.json can't be read",
  NO_TESTS: "No tests found",
  NO_ENTRYPOINT: "Nothing to run",
  ENTRYPOINT_MISSING: "Entry file not found",
  PACKAGE_JSON_MISSING: "package.json is missing",
  NO_TEST_SCRIPT: "No test script",
  PACKAGE_JSON_INVALID: "package.json can't be read",
  UNDECLARED_DEPENDENCIES: "Dependencies not declared",
  DEPENDENCY_POLICY: "Dependencies not allowed by this bounty",
  REQUIREMENTS_IGNORED: "requirements.txt is ignored",
  TS_ENTRYPOINT: "TypeScript entry file",
  PLAN: "What will run",
  PYTEST_ADDED: "pytest added automatically",
};

export const sandboxDocsUrl = (code: string) => `/docs/sandbox#${code}`;

export function makeFinding(
  code: FindingCode,
  severity: FindingSeverity,
  message: string,
  fix: string
): Finding {
  return { code, severity, title: TITLES[code], message, fix, docsUrl: sandboxDocsUrl(code) };
}

const RANK: Record<FindingSeverity, number> = { error: 0, warning: 1, info: 2 };

/** Errors first, then warnings, then info; otherwise keeps the order they were found in. */
export function sortFindings(findings: Finding[]): Finding[] {
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => RANK[a.f.severity] - RANK[b.f.severity] || a.i - b.i)
    .map(({ f }) => f);
}
