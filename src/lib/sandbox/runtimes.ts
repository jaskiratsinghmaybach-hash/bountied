import type { Runtime } from "@prisma/client";
import type { ManifestDependency } from "./bountied-manifest";

/**
 * Single source of truth for what each Runtime actually needs to execute.
 * Everything downstream (lib/sandbox/execute.ts, the submission form, the
 * giver preview) reads from this registry and is written to be runtime-
 * agnostic — none of it should ever say "if runtime === PYTHON" directly.
 * Adding a language is: add one entry here, build one E2B template, done.
 *
 * templateId: the E2B template to launch sandboxes from. Each runtime gets
 * its own template (its own Dockerfile, built via `e2b template build`) —
 * see /sandbox-templates/<runtime>/e2b.Dockerfile for the source. Until a
 * template is built and its real ID pasted in here, that runtime is
 * registered but not actually usable — see isRuntimeReady() below.
 *
 * Every runtime reads dependencies from the same file — bountied.json —
 * rather than a per-language manifest (requirements.txt, package.json,
 * Cargo.toml, ...). See lib/sandbox/bountied-manifest.ts for why (product
 * decision 2026-09-26). installCommand turns the parsed dependency list
 * into the real install invocation for this runtime's package manager; an
 * empty list means installCommand still runs but is handed nothing to
 * install (most runtimes should just no-op on an empty list rather than
 * fail).
 *
 * fallbackTemplateId / installRetry: the tiered-install system (product
 * decision 2026-09-02) — see their own doc comments just below.
 */

/**
 * Optional in-place retry ladder for install failures (product decision
 * 2026-09-02). This exists because ONE fixed base image can't have every
 * system library a solver's package might need (e.g. libpq-dev for
 * psycopg2, gcc for anything with a C extension) baked in without bloating
 * every sandbox boot for the common case that doesn't need them.
 *
 * Deliberately NOT "boot a second sandbox and retry from scratch" — that
 * doubles clone + install cost on every submission that hits this path.
 * Instead: stay in the SAME running sandbox, install the missing system
 * packages via apt-get, retry the same install command once. Only if that
 * still fails do we fall back to fallbackTemplateId (a separate, heavier
 * pre-built image) as a genuinely last resort — see execute.ts.
 *
 * classifyFailure decides whether a failure is even worth retrying:
 * a missing system lib is retry-worthy, a typo'd/nonexistent package name
 * or a real version conflict is not — retrying that wastes an apt-get
 * round-trip for a failure apt-get can never fix.
 */
export type InstallRetryConfig = {
  /** True if stderr looks like a missing system library/header/compiler, not a bad package spec. */
  classifyFailure: (stderr: string) => "missing-system-lib" | "unretryable";
  /** Maps the failure text to the apt package(s) likely to fix it. */
  resolveAptPackages: (stderr: string) => string[];
  /** Runs once before apt-get, e.g. "apt-get update -qq". */
  aptUpdateCommand: string;
  aptInstallCommand: (packages: string[]) => string;
};

export type RuntimeConfig = {
  label: string;
  templateId: string | null;
  /**
   * A separate, heavier pre-built E2B template (more system libs/headers
   * preinstalled) used ONLY if the in-place apt-get retry (installRetry)
   * still fails. Optional — a runtime with no fallback just fails after
   * the in-place retry instead of booting a second sandbox. Keep this to a
   * small, fixed number of pre-built images (not built per-submission) —
   * see /sandbox-templates/<runtime>/e2b.heavy.Dockerfile.
   */
  fallbackTemplateId: string | null;
  /**
   * Builds the install invocation for this runtime's package manager from
   * the parsed bountied.json dependency list. Called once, before the
   * giver's runCommand, whenever bountied.json is present in the submitted
   * code (regardless of whether `dependencies` is empty — a runtime can
   * choose to no-op on empty rather than skip the step entirely, e.g. if
   * it also wants to react to other manifest fields later). null means no
   * install step for this runtime at all.
   */
  installCommand: ((deps: ManifestDependency[]) => string) | null;
  /** null = no retry ladder for this runtime; install failures go straight to DEPENDENCY_INSTALL_FAILED. */
  installRetry: InstallRetryConfig | null;
  /** File extension used for single-file uploads in the submission form. */
  fileExtension: string;
};

/**
 * Package/header/compiler → apt package mapping for the common cases that
 * cause a pip install to fail on a lean base image. Deliberately a short,
 * hand-maintained list of the failures that actually show up in practice
 * rather than an attempt at completeness — extend as real failures surface
 * (check DEPENDENCY_INSTALL_FAILED submissions periodically and add
 * patterns here when the same root cause repeats).
 */
const PYTHON_SYSTEM_LIB_SIGNATURES: Array<{ pattern: RegExp; aptPackages: string[] }> = [
  { pattern: /pg_config executable not found/i, aptPackages: ["libpq-dev"] },
  { pattern: /Python\.h: No such file or directory/i, aptPackages: ["python3-dev"] },
  { pattern: /gcc.*command not found|error: command 'gcc' failed/i, aptPackages: ["build-essential"] },
  { pattern: /ffi\.h: No such file or directory/i, aptPackages: ["libffi-dev"] },
  { pattern: /jpeglib\.h: No such file or directory/i, aptPackages: ["libjpeg-dev"] },
  { pattern: /zlib\.h: No such file or directory/i, aptPackages: ["zlib1g-dev"] },
  { pattern: /openssl\/opensslv\.h: No such file or directory/i, aptPackages: ["libssl-dev"] },
  { pattern: /cmake.*not found/i, aptPackages: ["cmake"] },
  { pattern: /Microsoft Visual C\+\+|error: Unable to find vcvarsall/i, aptPackages: [] }, // Windows-only failure, no apt fix — falls through to unretryable
];

const PYTHON_INSTALL_RETRY: InstallRetryConfig = {
  classifyFailure: (stderr) => {
    const hasKnownSystemLibSignature = PYTHON_SYSTEM_LIB_SIGNATURES.some(
      (sig) => sig.pattern.test(stderr) && sig.aptPackages.length > 0
    );
    return hasKnownSystemLibSignature ? "missing-system-lib" : "unretryable";
  },
  resolveAptPackages: (stderr) => {
    const pkgs = new Set<string>();
    for (const sig of PYTHON_SYSTEM_LIB_SIGNATURES) {
      if (sig.pattern.test(stderr)) {
        for (const p of sig.aptPackages) pkgs.add(p);
      }
    }
    return Array.from(pkgs);
  },
  aptUpdateCommand: "apt-get update -qq",
  aptInstallCommand: (packages) => `apt-get install -y -qq ${packages.join(" ")}`,
};

export const RUNTIME_REGISTRY: Record<Runtime, RuntimeConfig> = {
  PYTHON: {
    label: "Python",
    // TODO: replace with the real template ID after running
    // `e2b template build` against sandbox-templates/python/e2b.Dockerfile
    templateId: "1z9fpclwmf3aeijmmv6s",
    // TODO: build sandbox-templates/python/e2b.heavy.Dockerfile (adds
    // build-essential, libpq-dev, libffi-dev, python3-dev, common headers
    // preinstalled) and paste its template id here. Until set, the
    // in-place apt-get retry is still attempted — this is only the
    // last-resort fallback on top of that.
    fallbackTemplateId: null,
    // pip needs an explicit comparator ("name==2.1.0", "name>=2.0"); a bare
    // "name 2.1.0" isn't valid pip syntax. bountied.json's version field is
    // a free-form string (lib/sandbox/bountied-manifest.ts) that a Solver's
    // AI assistant may write either as a bare version ("2.1.0") or already
    // pip-flavored ("==2.1.0", ">=2.0", "2.x"). If it already starts with a
    // comparator (or is a loose match like "2.x", which pip understands as
    // "2.*"), pass it through as-is; a bare leading digit gets "==" prefixed
    // so the common case a Giver actually gets from their AI just works.
    // pip rejects anything it still doesn't understand at install time —
    // that surfaces as a normal DEPENDENCY_INSTALL_FAILED, same as a
    // typo'd requirements.txt line would have before.
    installCommand: (deps) => {
      if (deps.length === 0) return "true"; // nothing declared — no-op, don't fail the step
      const specs = deps.map((d) => {
        if (!d.version) return d.name;
        const v = /^[=<>~!]/.test(d.version) ? d.version : `==${d.version}`;
        return `"${d.name}${v}"`;
      });
      return `pip install ${specs.join(" ")}`;
    },
    installRetry: PYTHON_INSTALL_RETRY,
    fileExtension: ".py",
  },
};

export function getRuntimeConfig(runtime: Runtime): RuntimeConfig {
  return RUNTIME_REGISTRY[runtime];
}

/** A runtime is only actually usable once its E2B template has been built and its ID filled in. */
export function isRuntimeReady(runtime: Runtime): boolean {
  return RUNTIME_REGISTRY[runtime].templateId !== null;
}

export function listReadyRuntimes(): Runtime[] {
  return (Object.keys(RUNTIME_REGISTRY) as Runtime[]).filter(isRuntimeReady);
}