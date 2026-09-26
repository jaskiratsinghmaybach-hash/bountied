/**
 * Parses a solver's bountied.json — the platform's own environment manifest
 * — and enforces the Giver's optional dependencyPolicy (Problem.dependencyPolicy)
 * BEFORE any E2B sandbox boots.
 *
 * bountied.json replaces requirements.txt (and any other per-language
 * dependency file) as the single manifest format every runtime submits,
 * per product decision 2026-09-26: with only Python live and requirements.txt
 * touching a handful of files, this was the last point at which switching
 * was cheap — waiting until more runtimes existed would have meant either
 * N per-language manifest formats or a painful later migration. A Solver's
 * AI coding assistant is expected to inspect the repo and generate this
 * file; the Solver copies the generated JSON into bountied.json at the repo
 * root. See lib/sandbox/runtimes.ts for how a runtime turns the parsed
 * manifest into an actual install command.
 *
 * Why the policy check has to run pre-boot: a policy violation is a $0
 * rejection if caught here (one GitHub API call to read the file), vs. the
 * cost of a full clone + sandbox boot if we let it through and failed
 * later. See product decision 2026-09-02 — this is the cost-control half
 * of the dependency work; lib/sandbox/execute.ts's apt-get retry ladder is
 * the reliability half.
 *
 * This module NEVER decides pass/fail for whether packages will actually
 * install — that's still lib/sandbox/execute.ts's job at sandbox time.
 * This only decides whether the Solver is ALLOWED to try, per the Giver's
 * stated fence, and gives execute.ts a normalized dependency list to
 * install from.
 */

export type DependencyPolicy = {
  /** 0 means "no external deps at all" — stdlib-only problems. */
  maxDependencies?: number;
  /** If set, ONLY these package names may appear — allowlist mode. */
  allowedPackages?: string[];
  /** Always rejected, regardless of allowlist mode. */
  bannedPackages?: string[];
};

/**
 * A single declared dependency. version is a free-form string (interpreted
 * per-runtime — "2.x" for pip's loose matching, an exact semver for npm,
 * etc.) rather than a parsed/validated version range: bountied.json has to
 * span ecosystems with genuinely different versioning schemes, and
 * validating each one's grammar here would tie this module to every
 * runtime's package manager. installCommand (runtimes.ts) owns turning
 * this into a real install invocation for its ecosystem.
 */
export type ManifestDependency = {
  name: string;
  version: string | null;
};

/**
 * The normalized shape lib/sandbox/execute.ts and lib/sandbox/runtimes.ts
 * actually consume. Intentionally a small subset of the full bountied.json
 * concept described in product discussions (entrypoint/build/test/run
 * commands, ports, etc.) — this module only owns the dependency-policy
 * surface. Fields beyond `dependencies` are parsed defensively (see
 * parseBountiedManifest) so a Solver's manifest can carry forward-looking
 * fields without breaking parsing, but only `dependencies` is used today.
 */
export type BountiedManifest = {
  dependencies: ManifestDependency[];
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
 * Package names across ecosystems are case-insensitive-ish in practice
 * (pip's PEP 503 normalization treats "-", "_", "." as equivalent; npm
 * scoped/unscoped names are lowercase by convention) — normalizing the
 * same way for every runtime means a Giver banning "scikit-learn" isn't
 * silently bypassed by "scikit_learn" in a bountied.json dependencies
 * block, regardless of which runtime the problem targets.
 */
function normalizePackageName(name: string): string {
  return name.trim().toLowerCase().replace(/[-_.]+/g, "-");
}

/**
 * Parses a bountied.json body into a BountiedManifest. Deliberately
 * defensive rather than a strict schema-validate-and-throw: a Solver's
 * manifest is untrusted input arriving before any sandbox boots, and a
 * malformed dependencies entry should be treated as "unresolvable" (see
 * checkDependencyPolicy's fail-closed handling) rather than crash the
 * whole submission pipeline over one bad line.
 *
 * Accepts dependencies as either an object map ({"numpy": "2.x"} — the
 * documented/generated shape) or an array of {name, version} — kept
 * permissive since a Solver's AI assistant is the one generating this
 * file and object-vs-array is an easy, harmless mistake to make.
 */
export function parseBountiedManifest(bountiedJsonText: string): {
  manifest: BountiedManifest | null;
  parseError: string | null;
} {
  let raw: unknown;
  try {
    raw = JSON.parse(bountiedJsonText);
  } catch {
    return { manifest: null, parseError: "bountied.json is not valid JSON." };
  }

  if (!raw || typeof raw !== "object") {
    return { manifest: null, parseError: "bountied.json must be a JSON object." };
  }

  const obj = raw as Record<string, unknown>;
  const depsRaw = obj.dependencies;
  const dependencies: ManifestDependency[] = [];

  if (depsRaw && typeof depsRaw === "object" && !Array.isArray(depsRaw)) {
    for (const [name, version] of Object.entries(depsRaw as Record<string, unknown>)) {
      if (typeof name !== "string" || name.trim().length === 0) continue;
      dependencies.push({
        name: normalizePackageName(name),
        version: typeof version === "string" ? version.trim() : null,
      });
    }
  } else if (Array.isArray(depsRaw)) {
    for (const entry of depsRaw) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.name !== "string" || e.name.trim().length === 0) continue;
      dependencies.push({
        name: normalizePackageName(e.name),
        version: typeof e.version === "string" ? e.version.trim() : null,
      });
    }
  }
  // depsRaw absent entirely = zero dependencies (a stdlib-only solution),
  // not an error — same as an empty requirements.txt was before.

  return { manifest: { dependencies }, parseError: null };
}

/**
 * The actual gate. Call this with the Giver's Problem.dependencyPolicy
 * (already parsed) and the Solver's raw bountied.json content, BEFORE
 * mirroring/booting anything.
 *
 * A parse failure always fails closed when a policy is active — same
 * reasoning as an unresolvable requirements.txt line under the old format:
 * an active policy is a deliberate Giver constraint, and an unparseable
 * manifest can't be checked against it, so it can't be let through. When
 * no policy is set at all, a parse failure is surfaced separately by the
 * mirror step (a broken bountied.json will fail dependency install anyway)
 * rather than blocked here.
 */
export function checkDependencyPolicy(
  policy: DependencyPolicy | null,
  bountiedJsonText: string | null
): PolicyCheckResult {
  const { manifest, parseError } = bountiedJsonText
    ? parseBountiedManifest(bountiedJsonText)
    : { manifest: { dependencies: [] }, parseError: null };

  const names = manifest?.dependencies.map((d) => d.name) ?? [];

  if (!policy) {
    return { ok: true, packageNames: names };
  }

  if (parseError || !manifest) {
    return {
      ok: false,
      reason:
        `This problem restricts dependencies, and bountied.json couldn't be ` +
        `verified against that restriction: ${parseError ?? "invalid manifest"}. ` +
        `Regenerate bountied.json and make sure it's valid JSON with a ` +
        `"dependencies" object.`,
      offendingPackages: [],
    };
  }

  if (policy.maxDependencies !== undefined && names.length > policy.maxDependencies) {
    return {
      ok: false,
      reason:
        `This problem allows at most ${policy.maxDependencies} ` +
        `${policy.maxDependencies === 1 ? "dependency" : "dependencies"}, but ` +
        `bountied.json lists ${names.length}.`,
      offendingPackages: names,
    };
  }

  if (policy.bannedPackages && policy.bannedPackages.length > 0) {
    const banned = new Set(policy.bannedPackages);
    const hit = names.filter((n) => banned.has(n));
    if (hit.length > 0) {
      return {
        ok: false,
        reason: `bountied.json uses package(s) this problem doesn't allow: ${hit.join(", ")}.`,
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
          `bountied.json uses package(s) not on that list: ${disallowed.join(", ")}.`,
        offendingPackages: disallowed,
      };
    }
  }

  return { ok: true, packageNames: names };
}
