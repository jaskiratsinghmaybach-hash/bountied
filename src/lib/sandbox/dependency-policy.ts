/**
 * Parses a solver's requirements.txt and enforces the Giver's optional
 * dependencyPolicy (Problem.dependencyPolicy) BEFORE any E2B sandbox boots.
 *
 * Why this has to run pre-boot: a policy violation is a $0 rejection if
 * caught here (one GitHub API call to read the file), vs. the cost of a
 * full clone + sandbox boot if we let it through and failed later. See
 * product decision 2026-09-02 — this is the cost-control half of the
 * dependency work; lib/sandbox/execute.ts's apt-get retry ladder is the
 * reliability half.
 *
 * This module NEVER decides pass/fail for whether packages will actually
 * install — that's still lib/sandbox/execute.ts's job at sandbox time.
 * This only decides whether the Solver is ALLOWED to try, per the Giver's
 * stated fence.
 */

export type DependencyPolicy = {
  /** 0 means "no external deps at all" — stdlib-only problems. */
  maxDependencies?: number;
  /** If set, ONLY these package names may appear — allowlist mode. */
  allowedPackages?: string[];
  /** Always rejected, regardless of allowlist mode. */
  bannedPackages?: string[];
};

export type PolicyCheckResult =
  | { ok: true; packageNames: string[] }
  | {
      ok: false;
      /** Human-readable reason shown to the solver — this becomes sandboxError. */
      reason: string;
      /** The specific package names that triggered the violation, for UI display. */
      offendingPackages: string[];
    };

/**
 * Narrows an unknown Json value (as read straight off Prisma's
 * Problem.dependencyPolicy) into a DependencyPolicy, dropping anything
 * malformed rather than throwing. A giver-set field that got corrupted or
 * hand-edited in the DB should fail open (no policy applied) — not crash
 * every review of that problem. Only reachable if someone bypasses the
 * validation this module's own setDependencyPolicy() would otherwise apply
 * before writing to the DB.
 */
export function parseDependencyPolicy(raw: unknown): DependencyPolicy | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const policy: DependencyPolicy = {};

  if (typeof obj.maxDependencies === "number" && obj.maxDependencies >= 0) {
    policy.maxDependencies = Math.floor(obj.maxDependencies);
  }
  if (Array.isArray(obj.allowedPackages)) {
    const list = obj.allowedPackages.filter(
      (p): p is string => typeof p === "string" && p.trim().length > 0
    );
    if (list.length > 0) policy.allowedPackages = list.map(normalizePackageName);
  }
  if (Array.isArray(obj.bannedPackages)) {
    const list = obj.bannedPackages.filter(
      (p): p is string => typeof p === "string" && p.trim().length > 0
    );
    if (list.length > 0) policy.bannedPackages = list.map(normalizePackageName);
  }

  const isEmpty =
    policy.maxDependencies === undefined &&
    policy.allowedPackages === undefined &&
    policy.bannedPackages === undefined;

  return isEmpty ? null : policy;
}

/**
 * pip package names are case-insensitive and treat "-" and "_" as
 * equivalent (PEP 503 normalization). Without this, a giver banning
 * "scikit-learn" would silently miss a requirements.txt line reading
 * "scikit_learn" or "Scikit-Learn" — a real bypass, not a hypothetical one.
 */
function normalizePackageName(name: string): string {
  return name.trim().toLowerCase().replace(/[-_.]+/g, "-");
}

/**
 * Extracts bare package names from a requirements.txt body. Deliberately
 * conservative — anything it can't confidently parse as a plain package
 * spec (a -r include, a git/URL install, a -e editable install, a bare
 * --flag) is passed through as an "unresolvable" entry rather than
 * silently dropped, so the caller can decide how to treat it (see
 * UNRESOLVABLE_LINE_POLICY below) instead of a banned package sneaking in
 * disguised as an unparseable line.
 */
export function extractPackageNames(requirementsTxt: string): {
  names: string[];
  unresolvableLines: string[];
} {
  const names: string[] = [];
  const unresolvableLines: string[] = [];

  for (const rawLine of requirementsTxt.split("\n")) {
    const line = rawLine.split("#")[0].trim(); // strip comments
    if (!line) continue;

    // -r other.txt / -e editable / --index-url etc. — not a plain package
    // spec. Flag rather than ignore: a giver banning "requests" should not
    // be bypassable via "-e git+https://.../requests-fork.git".
    if (line.startsWith("-")) {
      unresolvableLines.push(rawLine);
      continue;
    }

    // git/URL-based installs (git+https://..., https://...whl) — same
    // reasoning, flag rather than silently allow.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(line)) {
      unresolvableLines.push(rawLine);
      continue;
    }

    // Standard spec: name[extras]<comparator>version ; env marker
    // e.g. "numpy[extra]==1.26.4; python_version >= '3.9'"
    const match = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/);
    if (!match) {
      unresolvableLines.push(rawLine);
      continue;
    }
    names.push(normalizePackageName(match[1]));
  }

  return { names, unresolvableLines };
}

/**
 * The actual gate. Call this with the Giver's Problem.dependencyPolicy
 * (already parsed) and the Solver's raw requirements.txt content, BEFORE
 * mirroring/booting anything.
 *
 * unresolvableLines always fail closed when a policy is active — an
 * active policy is a deliberate Giver constraint, and letting a solver
 * route around it via an unparseable line defeats the point. When no
 * policy is set at all, unresolvable lines are irrelevant (nothing to
 * enforce) and are let through untouched, same as today's behavior.
 */
export function checkDependencyPolicy(
  policy: DependencyPolicy | null,
  requirementsTxt: string | null
): PolicyCheckResult {
  const { names, unresolvableLines } = requirementsTxt
    ? extractPackageNames(requirementsTxt)
    : { names: [], unresolvableLines: [] };

  if (!policy) {
    return { ok: true, packageNames: names };
  }

  if (unresolvableLines.length > 0) {
    return {
      ok: false,
      reason:
        `This problem restricts dependencies, and requirements.txt contains ` +
        `line(s) that can't be verified against that restriction: ` +
        `${unresolvableLines.slice(0, 3).join(", ")}. Use plain "package==version" ` +
        `entries only (no -e, -r, or direct URLs) when a dependency policy is active.`,
      offendingPackages: unresolvableLines,
    };
  }

  if (policy.maxDependencies !== undefined && names.length > policy.maxDependencies) {
    return {
      ok: false,
      reason:
        `This problem allows at most ${policy.maxDependencies} ` +
        `${policy.maxDependencies === 1 ? "dependency" : "dependencies"}, but ` +
        `requirements.txt lists ${names.length}.`,
      offendingPackages: names,
    };
  }

  if (policy.bannedPackages && policy.bannedPackages.length > 0) {
    const banned = new Set(policy.bannedPackages);
    const hit = names.filter((n) => banned.has(n));
    if (hit.length > 0) {
      return {
        ok: false,
        reason: `requirements.txt uses package(s) this problem doesn't allow: ${hit.join(", ")}.`,
        offendingPackages: hit,
      };
    }
  }

  if (policy.allowedPackages && policy.allowedPackages.length > 0) {
    const allowed = new Set(policy.allowedPackages);
    const disallowed = names.filter((n) => !allowed.has(n));
    if (disallowed.length > 0) {
      return {
        ok: false,
        reason:
          `This problem only allows specific packages: ${policy.allowedPackages.join(", ")}. ` +
          `requirements.txt uses package(s) not on that list: ${disallowed.join(", ")}.`,
        offendingPackages: disallowed,
      };
    }
  }

  return { ok: true, packageNames: names };
}