import { Sandbox } from "e2b";
import type { Runtime } from "@prisma/client";
import { getRuntimeConfig, isRuntimeReady } from "./runtimes";

const EXECUTION_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_CHARS = 50_000;

export type ExecutionResult =
  | {
      ok: true;
      stdout: string;
      stderr: string;
      exitCode: number;
    }
  | {
      ok: false;
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
      reason: `Runtime ${runtime} has no sandbox template configured yet — set templateId in lib/sandbox/runtimes.ts.`,
    };
  }

  const config = getRuntimeConfig(runtime);
  if (!config.templateId) {
    return {
      ok: false,
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
      return { ok: false, reason: "Only GitHub repo URLs are accepted." };
    }
    parsed.username = "x-access-token";
    parsed.password = githubToken;
    authenticatedUrl = parsed.toString();
  } catch {
    return { ok: false, reason: "Invalid repo URL." };
  }

  let sandbox: Sandbox | null = null;

  try {
    sandbox = await Sandbox.create(config.templateId, {
      timeoutMs: EXECUTION_TIMEOUT_MS,
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
        reason: `Could not clone the repository. Make sure your GitHub account has access to this repo. (${truncate(clone.stderr, 300)})`,
      };
    }

    // 2. Install dependencies if the solver included the expected file.
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
          return {
            ok: false,
            reason: `Dependency install failed (exit ${install.exitCode}):\n${truncate(install.stderr)}`,
          };
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