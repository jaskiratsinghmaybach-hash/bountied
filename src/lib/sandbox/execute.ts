import { Sandbox } from "e2b";
import type { Runtime } from "@prisma/client";
import { getRuntimeConfig, isRuntimeReady } from "./runtimes";

const EXECUTION_TIMEOUT_MS = 30_000;
// Sandbox lifetime (Sandbox.create's timeoutMs) has to cover clone + install
// + the retry ladder's extra apt-get/retry-install commands, each of which
// gets its own EXECUTION_TIMEOUT_MS budget below — NOT just one command's
// worth. Individual command timeouts are still the real per-step cost/
// runaway guard; this is only the outer envelope so a legitimate retry
// sequence doesn't get killed by sandbox lifetime before it finishes.
const SANDBOX_LIFETIME_MS = EXECUTION_TIMEOUT_MS * 5;
const MAX_OUTPUT_CHARS = 50_000;

/**
 * Lets the caller (the API route) map a failure onto the right
 * SubmissionStatus without execute.ts knowing anything about Prisma.
 * "dependency-install" is the one new addition (product decision
 * 2026-09-02) — everything else stays SANDBOX_FAILED, same as before.
 */
export type ExecutionFailureKind =
  | "clone"
  | "dependency-install"
  | "infra";

export type ExecutionResult =
  | {
      ok: true;
      stdout: string;
      stderr: string;
      exitCode: number;
    }
  | {
      ok: false;
      kind: ExecutionFailureKind;
      /**
       * Human-readable reason execution never produced real output.
       * Shown as sandboxError, distinct from a program that ran and
       * exited non-zero.
       */
      reason: string;
    };

/**
 * Runs a solver's submitted GitHub repo inside an ephemeral E2B sandbox
 * using the exact command the GIVER specified on the Problem — never a
 * command the solver controls.
 *
 * Security model (see product decisions 2026-08-02/03):
 *  - GitHub token is used for the git clone step only (server-side,
 *    inside the sandbox, never sent to the giver's browser).
 *  - Hard execution timeout — kills runaway/malicious code, caps E2B cost.
 *  - Sandbox always killed in finally — never left running idle.
 *  - Output truncated to MAX_OUTPUT_CHARS — no unbounded DB writes.
 *
 * Deliberately runtime-agnostic — every runtime-specific decision comes
 * from lib/sandbox/runtimes.ts. Do NOT add "if (runtime === ...)" branches
 * here; extend the registry instead.
 *
 * IMPORTANT: E2B's commands.run THROWS a CommandExitException on non-zero
 * exit codes. A program legitimately exiting non-zero is a completely
 * normal, successful execution (e.g. "tests failed" reported via exit code)
 * — not a sandbox failure — so we catch and recover stdout/stderr/exitCode
 * from the exception object via extractCommandResult() rather than treating
 * every thrown error as infrastructure failure.
 */
export async function executeSubmission(params: {
  runtime: Runtime;
  runCommand: string;
  repoUrl: string;
  githubToken: string;
}): Promise<ExecutionResult> {
  const { runtime, runCommand, repoUrl, githubToken } = params;

  if (!isRuntimeReady(runtime)) {
    return {
      ok: false,
      kind: "infra",
      reason: `Runtime ${runtime} has no sandbox template configured yet — set templateId in lib/sandbox/runtimes.ts.`,
    };
  }

  const config = getRuntimeConfig(runtime);
  if (!config.templateId) {
    return {
      ok: false,
      kind: "infra",
      reason: `Runtime ${runtime} has no sandbox template configured yet.`,
    };
  }

  // Build the authenticated clone URL server-side.
  // Format: https://x-access-token:<token>@github.com/owner/repo.git
  // This never leaves the server — it's used only inside the sandbox
  // and is not visible to the giver's browser at any point.
  let authenticatedUrl: string;
  try {
    const parsed = new URL(repoUrl);
    // Ensure it's actually a GitHub URL before embedding our token in it
    if (parsed.hostname !== "github.com") {
      return { ok: false, kind: "clone", reason: "Only GitHub repo URLs are accepted." };
    }
    parsed.username = "x-access-token";
    parsed.password = githubToken;
    authenticatedUrl = parsed.toString();
  } catch {
    return { ok: false, kind: "clone", reason: "Invalid repo URL." };
  }

  let sandbox: Sandbox | null = null;

  try {
    sandbox = await Sandbox.create(config.templateId, {
      timeoutMs: SANDBOX_LIFETIME_MS,
    });

    const workDir = "/home/user/submission";

    // 1. Clone the solver's repo using the token-authenticated URL.
    //    --depth 1 = shallow clone (only latest commit, much faster/cheaper).
    //    If this fails, it means the token doesn't grant access to this
    //    repo — the solver hasn't connected a GitHub account that has access.
    const clone = await sandbox.commands.run(
      `git clone --depth 1 "${authenticatedUrl}" "${workDir}"`,
      { timeoutMs: EXECUTION_TIMEOUT_MS }
    );
    if (clone.exitCode !== 0) {
      return {
        ok: false,
        kind: "clone",
        reason: `Could not clone the repository. Make sure your GitHub account has access to this repo. (${truncate(clone.stderr, 300)})`,
      };
    }

    // 2. Install dependencies if the solver included the expected file.
    //
    // Retry ladder (product decision 2026-09-02): a lean base image can't
    // have every system lib every package might need preinstalled without
    // bloating every single boot. So on failure we classify WHY it failed
    // before deciding what to do:
    //   - missing system lib (e.g. no pg_config, no gcc) -> apt-get the
    //     specific missing piece IN THIS SAME SANDBOX and retry the exact
    //     same install command once. No second boot, no second clone.
    //   - anything else (bad package name, real version conflict) -> that
    //     is never fixed by installing more system libraries, so we don't
    //     waste an apt-get round-trip retrying it. Fail straight to
    //     DEPENDENCY_INSTALL_FAILED with the real pip stderr.
    // A second full sandbox (config.fallbackTemplateId) is intentionally
    // NOT used here — see runtimes.ts doc comment on why that's reserved
    // as a last resort the platform doesn't currently need to reach for
    // to solve the common cases above.
    if (config.dependencyFileName && config.installCommand) {
      const checkDepFile = await sandbox.commands.run(
        `test -f "${workDir}/${config.dependencyFileName}" && echo "exists" || echo "missing"`,
        { timeoutMs: 5_000 }
      );
      const hasDepFile = checkDepFile.stdout.trim() === "exists";

      if (hasDepFile) {
        const install = await sandbox.commands.run(
          config.installCommand(config.dependencyFileName),
          { cwd: workDir, timeoutMs: EXECUTION_TIMEOUT_MS }
        );

        if (install.exitCode !== 0) {
          const retry = config.installRetry;
          const classification = retry?.classifyFailure(install.stderr) ?? "unretryable";

          if (retry && classification === "missing-system-lib") {
            const aptPackages = retry.resolveAptPackages(install.stderr);

            if (aptPackages.length > 0) {
              // Best-effort update — some base images have a stale apt
              // cache; if `update` itself fails we still attempt install,
              // since the cache may already be good enough.
              await sandbox.commands
                .run(retry.aptUpdateCommand, { timeoutMs: EXECUTION_TIMEOUT_MS })
                .catch(() => {});

              const aptInstall = await sandbox.commands.run(
                retry.aptInstallCommand(aptPackages),
                { timeoutMs: EXECUTION_TIMEOUT_MS }
              );

              if (aptInstall.exitCode === 0) {
                const retryInstall = await sandbox.commands.run(
                  config.installCommand(config.dependencyFileName),
                  { cwd: workDir, timeoutMs: EXECUTION_TIMEOUT_MS }
                );

                if (retryInstall.exitCode !== 0) {
                  return {
                    ok: false,
                    kind: "dependency-install",
                    reason: `Dependency install failed even after installing ${aptPackages.join(", ")} (exit ${retryInstall.exitCode}):\n${truncate(retryInstall.stderr)}`,
                  };
                }
                // Retry succeeded — fall through to step 3 as normal.
              } else {
                return {
                  ok: false,
                  kind: "dependency-install",
                  reason: `Dependency install failed (missing system library) and the automatic fix (${aptPackages.join(", ")}) also failed:\n${truncate(aptInstall.stderr, 1000)}`,
                };
              }
            } else {
              // Classified as a system-lib issue but we don't know which
              // apt package fixes it — nothing to retry with.
              return {
                ok: false,
                kind: "dependency-install",
                reason: `Dependency install failed (exit ${install.exitCode}):\n${truncate(install.stderr)}`,
              };
            }
          } else {
            // Not retry-worthy — bad package name/version conflict/etc.
            return {
              ok: false,
              kind: "dependency-install",
              reason: `Dependency install failed (exit ${install.exitCode}):\n${truncate(install.stderr)}`,
            };
          }
        }
      }
    }

    // 3. Run the GIVER's exact command — this is the trust boundary.
    let run: { stdout: string; stderr: string; exitCode: number };
    try {
      run = await sandbox.commands.run(runCommand, {
        cwd: workDir,
        timeoutMs: EXECUTION_TIMEOUT_MS,
      });
    } catch (err) {
      const recovered = extractCommandResult(err);
      if (recovered) {
        // Non-zero exit from the solver's program — this is a normal,
        // meaningful result, not a system error.
        run = recovered;
      } else {
        // Real infrastructure failure (timeout, connection drop, etc.).
        throw err;
      }
    }

    return {
      ok: true,
      stdout: truncate(run.stdout),
      stderr: truncate(run.stderr),
      exitCode: run.exitCode,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      kind: "infra",
      reason: `Sandbox execution failed: ${truncate(message, 500)}`,
    };
  } finally {
    if (sandbox) {
      await sandbox.kill().catch(() => {
        // Best-effort kill — sandbox's own timeoutMs guarantees teardown
        // even if this call fails.
      });
    }
  }
}

function truncate(text: string, max = MAX_OUTPUT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n[truncated — ${text.length - max} more characters]`;
}

/**
 * E2B's commands.run throws a CommandExitException on non-zero exit, but
 * the exception still carries the real stdout/stderr/exitCode. This
 * extracts them via duck-typing since the exact exception class properties
 * aren't pinned down in public docs — returns null if the thrown value
 * doesn't look like a command result (meaning it's a real infra failure).
 */
function extractCommandResult(
  err: unknown
): { stdout: string; stderr: string; exitCode: number } | null {
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  const stdout = e.stdout;
  const stderr = e.stderr;
  const exitCode = e.exitCode ?? e.exit_code;
  if (
    typeof stdout === "string" &&
    typeof stderr === "string" &&
    typeof exitCode === "number"
  ) {
    return { stdout, stderr, exitCode };
  }
  return null;
}