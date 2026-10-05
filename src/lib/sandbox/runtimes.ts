import type { Runtime } from "@prisma/client";
import { validateEntrypoint } from "./bountied-manifest";
import type { BountiedManifest, ManifestDependency } from "./bountied-manifest";

/**
 * Single source of truth for what each Runtime actually needs to execute.
 * Everything downstream (lib/sandbox/execute.ts, the submission form, the
 * giver preview) reads from this registry and is written to be runtime-
 * agnostic — none of it should ever say "if runtime === PYTHON" directly.
 * Adding a language is: add one entry here, build one E2B template, done.
 *
 * templateId: the E2B template to launch sandboxes from. Each runtime gets
 * its own template, defined as code (E2B Build System 2.0's Template()
 * builder — NOT the deprecated e2b.Dockerfile + e2b.toml + `e2b template
 * build` v1 flow) and built via `npm run e2b:build:prod` — see
 * /sandbox-templates/<runtime>/template.ts for the source and that
 * folder's README.md for the build steps. Until a template is built and
 * its real ID pasted in here, that runtime is registered but not
 * actually usable — see isRuntimeReady() below.
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
   * a separate "heavy" variant of /sandbox-templates/<runtime>/template.ts.
   */
  fallbackTemplateId: string | null;
  /**
   * Builds the install invocation for this runtime's package manager from
   * the parsed bountied.json dependency list. Called once, before the
   * evaluation step, whenever bountied.json is present in the submitted
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
  /**
   * Builds the evaluation command for this runtime from the Solver's
   * parsed, validated manifest. This is the ONLY function in the system
   * permitted to produce the string that reaches sandbox.commands.run for
   * the "evaluate the submission" step. No raw text from a Giver or a
   * Solver is ever executed: the command is a fixed per-runtime template,
   * and the only manifest-derived value interpolated is `entrypoint`, as
   * a path argument, after validateEntrypoint().
   *
   * The caller (parseBountiedManifest) has already validated `entrypoint`;
   * resolveEntrypoint() re-checks it right before interpolation and throws
   * rather than building a command from an unvalidated value (fail closed).
   * A throw here must be treated as an evaluation error, never swallowed.
   */
  buildEvaluationCommand: (manifest: BountiedManifest) => string;
};

/**
 * Returns the validated entrypoint to interpolate, or this runtime's
 * explicit default. Throws if the manifest carries an entrypoint that
 * fails validation — a manifest produced by parseBountiedManifest can
 * never trigger this; it only guards against a future caller constructing
 * a BountiedManifest by hand.
 */
function resolveEntrypoint(manifest: BountiedManifest, runtimeDefault: string): string {
  const candidate = manifest.entrypoint ?? runtimeDefault;
  const checked = validateEntrypoint(candidate);
  if (!checked.ok || checked.value === undefined) {
    throw new Error("Refusing to build an evaluation command from an invalid entrypoint.");
  }
  return checked.value;
}

/**
 * Explicit per-runtime defaults (not left implicit): used when bountied.json
 * omits executionMode / entrypoint.
 *   PYTHON: mode "test"  -> pytest; mode "run" with no entrypoint -> main.py
 *   NODE:   mode "test"  -> npm test; mode "run" with no entrypoint -> index.js
 */
const PYTHON_DEFAULT_ENTRYPOINT = "main.py";
const NODE_DEFAULT_ENTRYPOINT = "index.js";

/**
 * `python -m pytest` (not bare `pytest`) so the repo root is on sys.path
 * and tests can import top-level modules. `--tb=no` suppresses tracebacks:
 * pytest tracebacks and assertion diffs print lines of source, which would
 * otherwise reach the Giver pre-release as Review Evidence (see
 * lib/sandbox/review-evidence.ts and the trust-boundary note in
 * docs/review-engine-architecture.md §6). `-q` keeps the summary line terse.
 * NOTE: pytest is NOT preinstalled in the python:3.11-slim sandbox template —
 * a Solver must list it under bountied.json dependencies (or the template
 * must be rebuilt with it), otherwise test mode fails with "No module named pytest".
 */
const PYTHON_TEST_COMMAND = "python -m pytest -q --tb=no -p no:cacheprovider";

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

/**
 * Same purpose as PYTHON_SYSTEM_LIB_SIGNATURES, for npm installs. Native
 * addons (node-gyp) are the dominant real-world cause of an npm install
 * failing for a missing system dependency — Python wheels vs. Node native
 * bindings differ in mechanism but the failure shape (a missing compiler
 * or header) is the same class of problem, so this mirrors that list's
 * intent rather than its specific patterns.
 */
const NODE_SYSTEM_LIB_SIGNATURES: Array<{ pattern: RegExp; aptPackages: string[] }> = [
  { pattern: /gyp ERR!.*(gcc|g\+\+|make).*not found|error: command 'gcc' failed/i, aptPackages: ["build-essential"] },
  { pattern: /Python\.h: No such file or directory/i, aptPackages: ["python3-dev"] }, // node-gyp shells out to a Python build step
  { pattern: /libssl\.so|openssl\/opensslv\.h: No such file or directory/i, aptPackages: ["libssl-dev"] },
  { pattern: /libpq-fe\.h: No such file or directory/i, aptPackages: ["libpq-dev"] }, // pg / native postgres clients
  { pattern: /cairo\.h: No such file or directory/i, aptPackages: ["libcairo2-dev"] }, // canvas and similar native-graphics packages
];

const NODE_INSTALL_RETRY: InstallRetryConfig = {
  classifyFailure: (stderr) => {
    const hasKnownSystemLibSignature = NODE_SYSTEM_LIB_SIGNATURES.some(
      (sig) => sig.pattern.test(stderr) && sig.aptPackages.length > 0
    );
    return hasKnownSystemLibSignature ? "missing-system-lib" : "unretryable";
  },
  resolveAptPackages: (stderr) => {
    const pkgs = new Set<string>();
    for (const sig of NODE_SYSTEM_LIB_SIGNATURES) {
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
    // Built via `npm run e2b:build:prod` in sandbox-templates/python/
    // (template.ts + build.prod.ts there — see that folder's README.md).
    templateId: "1z9fpclwmf3aeijmmv6s",
    // TODO: build a "heavy" Python template.ts variant (adds
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
    // Python has no separate mandatory build step, so "build-test" behaves
    // exactly like "test" here (documented, not an accidental divergence).
    buildEvaluationCommand: (manifest) => {
      if (manifest.executionMode === "run") {
        return `python ${resolveEntrypoint(manifest, PYTHON_DEFAULT_ENTRYPOINT)}`;
      }
      return PYTHON_TEST_COMMAND; // "test", "build-test", or unspecified
    },
  },
  NODE: {
    label: "Node.js",
    // Built via `npm run e2b:build:prod` in sandbox-templates/node/
    // (template.ts + build.prod.ts there — see that folder's README.md).
    // Template name: bountied_temp_node. The Node language option is
    // enabled in flow-data.ts (nodejs) now that this ID is real.
    templateId: "arhf00a0xpuxkq5fs3gj",
    fallbackTemplateId: null,
    // npm's version syntax already matches bountied.json's convention
    // directly (bare "2.1.0" = exact pin, or a real npm range like "^2.0",
    // "~1.4", ">=3.0" — no comparator-prefix rewriting needed the way pip's
    // "==" requirement needed for Python). A bare version installs that
    // exact version; npm does not need "==" the way pip does.
    installCommand: (deps) => {
      if (deps.length === 0) return "true"; // nothing declared — no-op, don't fail the step
      const specs = deps.map((d) => (d.version ? `"${d.name}@${d.version}"` : d.name));
      return `npm install ${specs.join(" ")}`;
    },
    installRetry: NODE_INSTALL_RETRY,
    // .js, not .ts — fileExtension is keyed by Runtime, and typescript +
    // nodejs both collapse to this one Runtime (see LANGUAGE_TO_RUNTIME
    // below), so this can't distinguish them. Not a live issue today since
    // typescript isn't enabled yet (flow-data.ts), but when it is, this
    // field may need to move from RuntimeConfig to a per-language lookup
    // instead of assuming one extension per Runtime.
    fileExtension: ".js",
    // Plain Node has no mandatory build step, so "build-test" behaves
    // exactly like "test" here. When TypeScript is enabled, "build-test"
    // is where its fixed compile step belongs — extend THIS builder, never
    // accept a build command from the manifest.
    buildEvaluationCommand: (manifest) => {
      if (manifest.executionMode === "run") {
        return `node ${resolveEntrypoint(manifest, NODE_DEFAULT_ENTRYPOINT)}`;
      }
      return "npm test"; // "test", "build-test", or unspecified
    },
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

/**
 * Maps a Problem.language value (the Giver's selection from
 * components/problems/bounty-flow/step-language.tsx's LANGUAGE_DEFS — e.g.
 * "python", "typescript", "nodejs") to the Runtime that actually executes
 * it in the sandbox. NOT a 1:1 identity mapping: language and Runtime are
 * different axes on purpose. language is a Giver-facing product category
 * used for browsing/scoping bounties (a Giver picks between "TypeScript"
 * and "Node.js" as distinct, differently-scoped bounty types — see
 * flow-data.ts's SCOPE_MATRIX, where they have entirely different scope
 * options). Runtime is the sandbox execution environment — TypeScript and
 * Node.js bounties both execute on the exact same Node runtime/template,
 * so they intentionally collapse to one Runtime here.
 *
 * Falls back to PYTHON for any languageId with no explicit mapping —
 * matches the pre-multi-runtime default (every problem was created as
 * PYTHON regardless of language before this mapping existed), and keeps
 * an unmapped/future languageId from ever resolving to `undefined` and
 * crashing problem creation.
 */
const LANGUAGE_TO_RUNTIME: Partial<Record<string, Runtime>> = {
  python: "PYTHON",
  typescript: "NODE",
  nodejs: "NODE",
};

export function getRuntimeForLanguage(languageId: string | null): Runtime {
  if (!languageId) return "PYTHON";
  return LANGUAGE_TO_RUNTIME[languageId] ?? "PYTHON";
}