import { Sandbox, TimeoutError } from "e2b";
import type { Runtime } from "@prisma/client";
import { getRuntimeConfig, isRuntimeReady } from "./runtimes";
import { parseBountiedManifest } from "./bountied-manifest";
import type { BountiedManifest } from "./bountied-manifest";
import { planClone, redactSecrets } from "./clone";

/** The one manifest file every runtime reads dependencies from — see
 * lib/sandbox/bountied-manifest.ts (product decision 2026-09-26). */
const MANIFEST_FILE_NAME = "bountied.json";

const EXECUTION_TIMEOUT_MS = 30_000;
// Sandbox lifetime (Sandbox.create's timeoutMs) has to cover clone + install
// + the retry ladder's extra apt-get/retry-install commands, each of which
// gets its own EXECUTION_TIMEOUT_MS budget below — NOT just one command's
// worth. Individual command timeouts are still the real per-step cost/
// runaway guard; this is only the outer envelope so a legitimate retry
// sequence doesn't get killed by sandbox lifetime before it finishes.
const SANDBOX_LIFETIME_MS = EXECUTION_TIMEOUT_MS * 5;
const MAX_OUTPUT_CHARS = 10_000;
const WORK_DIR = "/home/user/submission";
const COMMIT_SHA = /^[0-9a-f]{40}$/;

/**
 * Lets callers map a failure onto the right status without execute.ts knowing
 * anything about Prisma or billing.
 *   clone              - the repo could not be fetched (access, bad URL, timeout)
 *   dependency-install - declared dependencies could not be installed
 *   setup              - the clone worked but is not what we were asked to run
 *                        (wrong commit, unreadable commit, unbuildable command)
 *   timeout            - the Solver's program ran past the time limit
 *   infra              - the platform failed (sandbox, network, our own timeouts)
 */
export type ExecutionFailureKind =
  | "clone"
  | "dependency-install"
  | "setup"
  | "timeout"
  | "infra";

/**
 * Flat shape (not a union): this repo runs `strict: false`, where an ok/!ok
 * union does not narrow. Fields marked "ok only" / "failure only" are only set
 * in that case.
 */
export type ExecutionResult = {
  ok: boolean;
  /** ok only. */
  stdout?: string;
  /** ok only. */
  stderr?: string;
  /** ok only. */
  exitCode?: number;
  /** The exact commit that was cloned and run. Set whenever the clone got that far. */
  commitSha?: string;
  /** failure only. */
  kind?: ExecutionFailureKind;
  /**
   * failure only. Human-readable reason execution never produced real output.
   * Shown as sandboxError, distinct from a program that ran and exited non-zero.
   */
  reason?: string;
  /**
   * failure only. Bounded, secret-scrubbed output of the step that failed
   * (for example the failed install's stderr). It is the Solver's own output:
   * for the Solver's diagnosis only, never for a Giver.
   */
  output?: string;
};

/** What the runner needs from a sandbox. e2b's Sandbox satisfies it; tests pass a fake. */
export type CommandOutcome = { stdout: string; stderr: string; exitCode: number };
type RunOptions = { cwd?: string; timeoutMs?: number; envs?: Record<string, string> };
export type SandboxLike = {
  commands: { run(command: string, options?: RunOptions): Promise<CommandOutcome> };
  kill(): Promise<unknown>;
};
export type ExecuteDeps = {
  createSandbox?: (templateId: string, options: { timeoutMs: number }) => Promise<SandboxLike>;
};

const defaultCreateSandbox: NonNullable<ExecuteDeps["createSandbox"]> = async (templateId, options) =>
  (await Sandbox.create(templateId, options)) as unknown as SandboxLike;

/**
 * Runs a solver's GitHub repo inside an ephemeral E2B sandbox.
 *
 * NO raw text from a Giver or a Solver is ever executed. The evaluation
 * command is produced solely by the runtime adapter
 * (RuntimeConfig.buildEvaluationCommand in lib/sandbox/runtimes.ts) from a
 * validated manifest — a fixed per-runtime template, never user text.
 * Problem.runCommand (legacy) is not read. See docs/review-engine-architecture.md.
 *
 * Two ways to choose what runs:
 *  - `manifest` given (Solver tests): the planner's effective manifest is used
 *    as-is. bountied.json in the repo is not re-read. Dependencies are
 *    installed only if the list is non-empty.
 *  - `manifest` omitted (Giver review of the mirrored repo): bountied.json is
 *    read from the clone, as before.
 *
 * `expectedCommitSha`, when given, must equal the cloned HEAD or the run stops
 * with a "setup" failure before anything of the Solver's runs. This is what
 * ties a test to one exact commit.
 *
 * Security model (see product decisions 2026-08-02/03):
 *  - The token is used for the git clone step only, as a header in an env var
 *    for that one command (see clone.ts), and never reaches the Solver's code.
 *  - Hard per-step timeouts kill runaway code and cap E2B cost.
 *  - The sandbox is always killed in finally.
 *  - Output is truncated to MAX_OUTPUT_CHARS.
 *
 * Deliberately runtime-agnostic: no `if (runtime === ...)` here; extend the
 * registry in runtimes.ts instead.
 *
 * E2B's commands.run THROWS a CommandExitError on a non-zero exit. Every step
 * therefore goes through runCommandTolerant(), which turns that into a normal
 * result. A program exiting non-zero is a real result, not a sandbox failure.
 */
export async function executeSubmission(
  params: {
    runtime: Runtime;
    repoUrl: string;
    githubToken: string;
    expectedCommitSha?: string;
    manifest?: BountiedManifest;
  },
  deps: ExecuteDeps = {}
): Promise<ExecutionResult> {
  const { runtime, repoUrl, githubToken, expectedCommitSha } = params;
  const createSandbox = deps.createSandbox ?? defaultCreateSandbox;
  const scrub = (text: string) => redactSecrets(text, githubToken);

  if (!isRuntimeReady(runtime)) {
    return {
      ok: false,
      kind: "infra",
      reason: `Runtime ${runtime} has no sandbox template configured yet — set templateId in lib/sandbox/runtimes.ts.`,
    };
  }

  const config = getRuntimeConfig(runtime);
  if (!config.templateId) {
    return { ok: false, kind: "infra", reason: `Runtime ${runtime} has no sandbox template configured yet.` };
  }
  if (expectedCommitSha !== undefined && !COMMIT_SHA.test(expectedCommitSha)) {
    return { ok: false, kind: "setup", reason: "The commit to test is not a valid 40-character SHA." };
  }

  // Checked before a sandbox is booted: a bad URL should cost nothing.
  const plan = planClone(repoUrl, WORK_DIR, githubToken);
  if (!plan.ok || !plan.command) {
    return { ok: false, kind: "clone", reason: plan.reason ?? "Invalid repo URL." };
  }

  let sandbox: SandboxLike | null = null;

  try {
    sandbox = await createSandbox(config.templateId, { timeoutMs: SANDBOX_LIFETIME_MS });

    // 1. Clone (command planned above). The token is NOT in the URL and is not
    //    written anywhere in the sandbox: see clone.ts. --depth 1 = shallow clone.
    const clone = await runCommandTolerant(sandbox, plan.command, {
      envs: plan.envs,
      timeoutMs: EXECUTION_TIMEOUT_MS,
    });
    if (clone.timedOut || clone.exitCode !== 0) {
      const detail = clone.timedOut ? "the clone took too long" : clone.stderr;
      return {
        ok: false,
        kind: "clone",
        reason: `Could not clone the repository. Make sure your GitHub account has access to this repo. (${truncate(scrub(detail), 300)})`,
      };
    }

    // 2. Pin the commit. Must happen BEFORE .git is removed.
    const head = await runCommandTolerant(sandbox, `git -C "${WORK_DIR}" rev-parse HEAD`, { timeoutMs: 10_000 });
    const commitSha = head.stdout.trim().toLowerCase();
    if (head.timedOut || head.exitCode !== 0 || !COMMIT_SHA.test(commitSha)) {
      return { ok: false, kind: "setup", reason: "Could not read the commit of the cloned repository." };
    }
    if (expectedCommitSha !== undefined && commitSha !== expectedCommitSha.toLowerCase()) {
      return {
        ok: false,
        kind: "setup",
        commitSha,
        reason: "The repository has a newer commit than the one that was prepared for testing. Run the check again.",
      };
    }

    // The Solver's code runs in this directory next. Drop the git metadata so
    // nothing from the clone step is visible to it.
    const strip = await runCommandTolerant(sandbox, `rm -rf "${WORK_DIR}/.git"`, { timeoutMs: 10_000 });
    if (strip.timedOut || strip.exitCode !== 0) {
      return { ok: false, kind: "infra", commitSha, reason: "Could not prepare the sandbox." };
    }

    // 3. Which manifest? The planner's, or bountied.json from the clone.
    let manifest: BountiedManifest;
    let installNeeded: boolean;
    if (params.manifest) {
      manifest = params.manifest;
      installNeeded = manifest.dependencies.length > 0;
    } else {
      const read = await runCommandTolerant(
        sandbox,
        `cat "${WORK_DIR}/${MANIFEST_FILE_NAME}" 2>/dev/null || echo "__MISSING__"`,
        { timeoutMs: 5_000 }
      );
      const hasManifest = !read.timedOut && read.stdout.trim() !== "__MISSING__";
      manifest = { dependencies: [] };
      if (hasManifest) {
        const parsed = parseBountiedManifest(read.stdout);
        if (parsed.parseError || !parsed.manifest) {
          // Includes an invalid entrypoint/executionMode: rejected before the
          // evaluation command is ever built — same severity as malformed JSON.
          return {
            ok: false,
            kind: "dependency-install",
            commitSha,
            reason: `bountied.json could not be parsed: ${parsed.parseError ?? "invalid manifest"}.`,
          };
        }
        manifest = parsed.manifest;
      }
      installNeeded = hasManifest;
    }

    // 4. Install, with the retry ladder (product decision 2026-09-02): a
    //    missing system library is fixed in this same sandbox with apt-get and
    //    one retry; anything else (bad name, version conflict) fails straight
    //    away with the real stderr.
    if (config.installCommand && installNeeded) {
      const failure = await installDependencies(sandbox, config, manifest, scrub);
      if (failure) return { ...failure, commitSha };
    }

    // 5. Evaluate. The command comes ONLY from the runtime adapter, built from
    //    the validated manifest — never from Giver or Solver text.
    let evaluationCommand: string;
    try {
      evaluationCommand = config.buildEvaluationCommand(manifest);
    } catch {
      // The adapter refuses to build from an invalid entrypoint (fail closed).
      return { ok: false, kind: "setup", commitSha, reason: "Bountied could not build a safe command to run your project." };
    }
    const run = await runCommandTolerant(sandbox, evaluationCommand, {
      cwd: WORK_DIR,
      timeoutMs: EXECUTION_TIMEOUT_MS,
    });
    if (run.timedOut) {
      return {
        ok: false,
        kind: "timeout",
        commitSha,
        reason: `The program did not finish within ${EXECUTION_TIMEOUT_MS / 1000} seconds and was stopped.`,
      };
    }

    return {
      ok: true,
      stdout: truncate(scrub(run.stdout)),
      stderr: truncate(scrub(run.stderr)),
      exitCode: run.exitCode,
      commitSha,
    };
  } catch (err) {
    const message = scrub(err instanceof Error ? err.message : String(err));
    return { ok: false, kind: "infra", reason: `Sandbox execution failed: ${truncate(message, 500)}` };
  } finally {
    if (sandbox) {
      await sandbox.kill().catch(() => {
        // Best-effort kill — sandbox's own timeoutMs guarantees teardown
        // even if this call fails.
      });
    }
  }
}

type FailureResult = Pick<ExecutionResult, "ok" | "kind" | "reason" | "output">;

async function installDependencies(
  sandbox: SandboxLike,
  config: ReturnType<typeof getRuntimeConfig>,
  manifest: BountiedManifest,
  scrub: (text: string) => string
): Promise<FailureResult | null> {
  const installCommand = config.installCommand(manifest.dependencies);
  const opts = { cwd: WORK_DIR, timeoutMs: EXECUTION_TIMEOUT_MS };

  const tooSlow: FailureResult = {
    ok: false,
    kind: "infra",
    reason: `Installing dependencies took longer than ${EXECUTION_TIMEOUT_MS / 1000} seconds.`,
  };
  const failed = (message: string, r: CommandOutcome): FailureResult => ({
    ok: false,
    kind: "dependency-install",
    reason: message,
    output: truncate(scrub([r.stderr, r.stdout].filter(Boolean).join("\n"))),
  });

  const install = await runCommandTolerant(sandbox, installCommand, opts);
  if (install.timedOut) return tooSlow;
  if (install.exitCode === 0) return null;

  const retry = config.installRetry;
  const classification = retry?.classifyFailure(install.stderr) ?? "unretryable";
  if (!retry || classification !== "missing-system-lib") {
    // Not retry-worthy — bad package name/version conflict/etc.
    return failed(`Dependency install failed (exit ${install.exitCode}):\n${truncate(scrub(install.stderr))}`, install);
  }

  const aptPackages = retry.resolveAptPackages(install.stderr);
  if (aptPackages.length === 0) {
    // Classified as a system-lib issue but we don't know which apt package fixes it.
    return failed(`Dependency install failed (exit ${install.exitCode}):\n${truncate(scrub(install.stderr))}`, install);
  }

  // Best-effort update — a stale apt cache is common; if `update` itself fails
  // we still attempt the install.
  await runCommandTolerant(sandbox, retry.aptUpdateCommand, { timeoutMs: EXECUTION_TIMEOUT_MS });
  const apt = await runCommandTolerant(sandbox, retry.aptInstallCommand(aptPackages), {
    timeoutMs: EXECUTION_TIMEOUT_MS,
  });
  if (apt.timedOut) return tooSlow;
  if (apt.exitCode !== 0) {
    return failed(
      `Dependency install failed (missing system library) and the automatic fix (${aptPackages.join(", ")}) also failed:\n${truncate(scrub(apt.stderr), 1000)}`,
      install
    );
  }

  const again = await runCommandTolerant(sandbox, installCommand, opts);
  if (again.timedOut) return tooSlow;
  if (again.exitCode !== 0) {
    return failed(
      `Dependency install failed even after installing ${aptPackages.join(", ")} (exit ${again.exitCode}):\n${truncate(scrub(again.stderr))}`,
      again
    );
  }
  return null;
}

/** One finished step. `timedOut` means the step hit its own time limit (stdout/stderr are empty then). */
export type StepResult = CommandOutcome & { timedOut: boolean };

/**
 * commands.run that never throws for a command that ran. A non-zero exit
 * (CommandExitError) comes back as a normal result, and a step that exceeds
 * its own timeoutMs comes back as timedOut. Anything else — a dropped
 * connection, a killed sandbox, a request timeout — is a real infrastructure
 * failure and is rethrown for the caller's catch.
 */
export async function runCommandTolerant(
  sandbox: SandboxLike,
  command: string,
  options?: RunOptions
): Promise<StepResult> {
  try {
    const r = await sandbox.commands.run(command, options);
    return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", exitCode: r.exitCode ?? 0, timedOut: false };
  } catch (err) {
    const recovered = extractCommandResult(err);
    if (recovered) return { ...recovered, timedOut: false };
    if (isCommandTimeout(err)) return { stdout: "", stderr: "", exitCode: -1, timedOut: true };
    throw err;
  }
}

/**
 * e2b maps the gRPC "deadline exceeded" a command's own timeoutMs produces to a
 * TimeoutError whose message names 'timeoutMs'. Its request-level timeout
 * ('requestTimeoutMs') is a different message and stays an infra failure.
 */
export function isCommandTimeout(err: unknown): boolean {
  return err instanceof TimeoutError && /exceeding 'timeoutMs'/.test(err.message);
}

function truncate(text: string, max = MAX_OUTPUT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n[truncated — ${text.length - max} more characters]`;
}

/**
 * E2B's CommandExitError still carries the real stdout/stderr/exitCode.
 * Extracted by duck-typing (they are prototype getters); null when the thrown
 * value doesn't look like a command result, meaning a real infra failure.
 */
function extractCommandResult(err: unknown): CommandOutcome | null {
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  const stdout = e.stdout;
  const stderr = e.stderr;
  const exitCode = e.exitCode ?? e.exit_code;
  if (typeof stdout === "string" && typeof stderr === "string" && typeof exitCode === "number") {
    return { stdout, stderr, exitCode };
  }
  return null;
}
