import { Sandbox } from "e2b";
import type { Runtime } from "@prisma/client";
import { getRuntimeConfig, isRuntimeReady } from "@/lib/sandbox/runtimes";
import {
  createPlatformRepo,
  deletePlatformRepo,
  repoNameForSubmission,
  type PlatformRepo,
} from "./platform-repo";

/**
 * A mirror moves a whole git history between two remotes, which needs a real
 * `git` binary. Next.js server routes run in a serverless-ish environment
 * with no guarantee of one, so the git work happens inside an E2B sandbox —
 * the same infrastructure lib/sandbox/execute.ts already uses. We reuse the
 * problem's runtime template rather than building a git-only template; every
 * E2B base image ships git.
 *
 * The mirror is deliberately a separate, longer-lived sandbox from the
 * execution one: cloning and pushing a real repository regularly exceeds the
 * 30s execution budget, and a slow clone must not eat into the time the
 * solver's code gets to run.
 */
const MIRROR_TIMEOUT_MS = 120_000;

export type MirrorResult =
  | { ok: true; repo: PlatformRepo }
  | { ok: false; reason: string };

/**
 * Imports a solver's submitted repository (public or private) into the
 * platform's GitHub account as a standalone PRIVATE repository, and returns
 * the platform's own URL for it.
 *
 * Two different credentials are in play and they are not interchangeable:
 *   - solverToken  — the solver's OAuth token. READ side only: it is what
 *     grants access to their private source repo.
 *   - PLATFORM_GITHUB_TOKEN — the platform account's PAT (used inside
 *     platform-repo.ts and for the push below). WRITE side only.
 *
 * Neither token ever reaches a browser. Both are embedded in remote URLs
 * inside the sandbox only, and the sandbox is destroyed in `finally`.
 *
 * The new repo is created PRIVATE. It becomes public only when the giver
 * accepts and escrow releases — see lib/escrow/release.ts. Creating it
 * public here would hand the giver the solution before paying, which is the
 * exact failure mode the reveal gate exists to prevent.
 */
export async function mirrorSubmissionRepo(params: {
  submissionId: string;
  sourceRepoUrl: string;
  solverToken: string;
  runtime: Runtime;
  problemTitle?: string;
}): Promise<MirrorResult> {
  const { submissionId, sourceRepoUrl, solverToken, runtime, problemTitle } = params;

  const platformToken = process.env.PLATFORM_GITHUB_TOKEN;
  if (!platformToken) {
    return {
      ok: false,
      reason:
        "PLATFORM_GITHUB_TOKEN is not configured — the platform cannot import repositories.",
    };
  }

  if (!isRuntimeReady(runtime)) {
    return { ok: false, reason: `Runtime ${runtime} has no sandbox template configured yet.` };
  }
  const templateId = getRuntimeConfig(runtime).templateId;
  if (!templateId) {
    return { ok: false, reason: `Runtime ${runtime} has no sandbox template configured yet.` };
  }

  // Validate and build the authenticated SOURCE url before creating anything
  // on GitHub — cheaper to fail here than to clean up an orphaned repo.
  let authenticatedSourceUrl: string;
  try {
    const parsed = new URL(sourceRepoUrl);
    if (parsed.hostname !== "github.com") {
      return { ok: false, reason: "Only GitHub repo URLs are accepted." };
    }
    parsed.username = "x-access-token";
    parsed.password = solverToken;
    authenticatedSourceUrl = parsed.toString();
  } catch {
    return { ok: false, reason: "Invalid repository URL." };
  }

  const created = await createPlatformRepo(
    repoNameForSubmission(submissionId),
    problemTitle
      ? `Submission for "${problemTitle}" — mirrored by Bountied.`
      : undefined
  );
  if (!created.ok) return created;
  const repo = created.repo;

  // Authenticated DESTINATION url, using the PLATFORM token.
  const authenticatedDestUrl = (() => {
    const parsed = new URL(repo.cloneUrl);
    parsed.username = "x-access-token";
    parsed.password = platformToken;
    return parsed.toString();
  })();

  let sandbox: Sandbox | null = null;
  try {
    sandbox = await Sandbox.create(templateId, { timeoutMs: MIRROR_TIMEOUT_MS });

    const bareDir = "/tmp/mirror.git";

    // 1. Bare clone of the solver's repo — full history, no working tree.
    const clone = await sandbox.commands.run(
      `git clone --bare "${authenticatedSourceUrl}" "${bareDir}"`,
      { timeoutMs: MIRROR_TIMEOUT_MS }
    );
    if (clone.exitCode !== 0) {
      await deletePlatformRepo(repo.fullName);
      return {
        ok: false,
        reason: `Could not read your repository. Make sure your connected GitHub account still has access to it. (${scrub(
          clone.stderr,
          [solverToken, platformToken]
        ).slice(0, 300)})`,
      };
    }

    // 2. Push branches and tags to the platform repo.
    //    `push --all` + `push --tags` rather than `push --mirror`: --mirror
    //    would also try to push refs/pull/* from the source clone, which
    //    GitHub refuses, failing the whole push.
    const push = await sandbox.commands.run(
      `git push --all "${authenticatedDestUrl}" && git push --tags "${authenticatedDestUrl}"`,
      { cwd: bareDir, timeoutMs: MIRROR_TIMEOUT_MS }
    );
    if (push.exitCode !== 0) {
      await deletePlatformRepo(repo.fullName);
      return {
        ok: false,
        reason: `Could not import your repository into the platform account. (${scrub(
          push.stderr,
          [solverToken, platformToken]
        ).slice(0, 300)})`,
      };
    }

    return { ok: true, repo };
  } catch (err) {
    await deletePlatformRepo(repo.fullName);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: `Repository import failed: ${scrub(message, [solverToken, platformToken]).slice(0, 500)}`,
    };
  } finally {
    if (sandbox) {
      await sandbox.kill().catch(() => {
        // Best-effort — the sandbox's own timeoutMs guarantees teardown.
      });
    }
  }
}

/**
 * git writes the remote URL into its error messages, and our remote URLs
 * carry access tokens. Those messages are stored on Submission.sandboxError
 * and rendered to the giver, so any token substring must be removed before
 * the text leaves this module.
 */
function scrub(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length > 0) {
      out = out.split(secret).join("***");
    }
  }
  return out;
}
