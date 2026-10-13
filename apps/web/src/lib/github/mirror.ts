import { Sandbox } from "e2b";
import type { Runtime } from "@prisma/client";
import { getRuntimeConfig, isRuntimeReady } from "@/lib/sandbox/runtimes";
import { runCommandTolerant } from "@/lib/sandbox/execute";
import type { SandboxLike } from "@/lib/sandbox/execute";
import { redactSecrets } from "@/lib/sandbox/clone";
import { parseGithubRepoUrl } from "./repo-snapshot";
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

/** What the mirror needs from the outside world. Real ones by default; tests pass fakes. */
export type MirrorDeps = {
  createRepo?: typeof createPlatformRepo;
  deleteRepo?: typeof deletePlatformRepo;
  createSandbox?: (templateId: string, options: { timeoutMs: number }) => Promise<SandboxLike>;
};

const defaultCreateSandbox: NonNullable<MirrorDeps["createSandbox"]> = async (templateId, options) =>
  (await Sandbox.create(templateId, options)) as unknown as SandboxLike;

/** `x-access-token:<token>` as the Basic credential git sends in an HTTP header. */
const basicAuth = (token: string) => Buffer.from(`x-access-token:${token}`).toString("base64");

export type MirrorResult =
  | {
      ok: true;
      repo: PlatformRepo;
      reason?: undefined;
      /** The commit at the default branch's HEAD that was mirrored (40 hex), or null if it couldn't be read. */
      mirroredCommitSha?: string | null;
    }
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
 * Neither token ever reaches a browser. Each is handed to ONE git command as
 * an HTTP auth header through an environment variable (the same way
 * lib/sandbox/clone.ts does it), never placed in a URL: so neither appears in
 * a command line, in the bare repo's .git/config, or in git's error text. The
 * solver token exists only for the clone command and the platform token only
 * for the push command. The sandbox is destroyed in `finally`.
 *
 * The solver's repo URL is attacker-controlled text that ends up inside a
 * shell command, so it is NEVER used as given: it must be exactly
 * https://github.com/<owner>/<repo> (owner and repo made only of letters,
 * digits, dot, dash, underscore) and the clone URL is rebuilt from those two
 * parts. A URL like https://github.com/a/b$(...) used to pass a host-only check
 * and run inside the sandbox that later receives the platform token.
 *
 * The new repo is created PRIVATE. It becomes public only when the giver
 * accepts and escrow releases — see lib/escrow/release.ts. Creating it
 * public here would hand the giver the solution before paying, which is the
 * exact failure mode the reveal gate exists to prevent.
 */
export async function mirrorSubmissionRepo(
  params: {
    submissionId: string;
    sourceRepoUrl: string;
    solverToken: string;
    runtime: Runtime;
    problemTitle?: string;
    attemptNumber: number;
  },
  deps: MirrorDeps = {}
): Promise<MirrorResult> {
  const { submissionId, sourceRepoUrl, solverToken, runtime, problemTitle, attemptNumber } = params;
  const createRepo = deps.createRepo ?? createPlatformRepo;
  const deleteRepo = deps.deleteRepo ?? deletePlatformRepo;
  const createSandbox = deps.createSandbox ?? defaultCreateSandbox;

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

  // Validate the SOURCE url before creating anything on GitHub: cheaper to fail
  // here than to clean up an orphaned repo, and the value is rebuilt from its
  // validated parts so nothing but a plain owner/repo can reach a shell.
  const source = parseGithubRepoUrl(sourceRepoUrl);
  if (!source) {
    return { ok: false, reason: "Only plain https://github.com/owner/repo URLs are accepted." };
  }
  const sourceUrl = `https://github.com/${source.owner}/${source.repo}`;

  const created = await createRepo(
    repoNameForSubmission(submissionId, attemptNumber),
    problemTitle
      ? `Submission for "${problemTitle}" — mirrored by Bountied.`
      : undefined
  );
  if (!created.ok) return created;
  const repo = created.repo;

  // DESTINATION url: the address GitHub gave back for the repo we just created,
  // re-validated the same strict way before it goes anywhere near a shell.
  const dest = parseGithubRepoUrl(repo.cloneUrl);
  if (!dest) {
    await deleteRepo(repo.fullName);
    return { ok: false, reason: "The platform repository has an unexpected address." };
  }
  const destUrl = `https://github.com/${dest.owner}/${dest.repo}.git`;

  const redact = (text: string) => redactSecrets(redactSecrets(text, solverToken), platformToken);

  let sandbox: SandboxLike | null = null;
  try {
    sandbox = await createSandbox(templateId, { timeoutMs: MIRROR_TIMEOUT_MS });

    const bareDir = "/tmp/mirror.git";

    // E2B's commands.run THROWS on a non-zero exit, so every step goes through
    // runCommandTolerant: a failed clone or push is then reported with git's own
    // (scrubbed) stderr instead of falling into the generic catch below.
    const box = sandbox;

    // 1. Bare clone of the solver's repo — full history, no working tree.
    //    Only the SOLVER token is in this command's environment.
    const clone = await runCommandTolerant(
      box,
      `git -c "http.extraHeader=Authorization: Basic $BOUNTIED_SRC_AUTH" clone --bare "${sourceUrl}" "${bareDir}"`,
      {
        timeoutMs: MIRROR_TIMEOUT_MS,
        envs: { GIT_TERMINAL_PROMPT: "0", BOUNTIED_SRC_AUTH: basicAuth(solverToken) },
      }
    );
    if (clone.timedOut || clone.exitCode !== 0) {
      await deleteRepo(repo.fullName);
      return {
        ok: false,
        reason: `Could not read your repository. Make sure your connected GitHub account still has access to it. (${
          clone.timedOut ? "the clone took too long" : redact(clone.stderr).slice(0, 300)
        })`,
      };
    }

    // 2. Push branches and tags to the platform repo.
    //    `push --all` + `push --tags` rather than `push --mirror`: --mirror
    //    would also try to push refs/pull/* from the source clone, which
    //    GitHub refuses, failing the whole push.
    //    Only the PLATFORM token is in this command's environment.
    const pushAuth = `git -c "http.extraHeader=Authorization: Basic $BOUNTIED_DEST_AUTH"`;
    const push = await runCommandTolerant(
      box,
      `${pushAuth} push --all "${destUrl}" && ${pushAuth} push --tags "${destUrl}"`,
      {
        cwd: bareDir,
        timeoutMs: MIRROR_TIMEOUT_MS,
        envs: { GIT_TERMINAL_PROMPT: "0", BOUNTIED_DEST_AUTH: basicAuth(platformToken) },
      }
    );
    if (push.timedOut || push.exitCode !== 0) {
      await deleteRepo(repo.fullName);
      return {
        ok: false,
        reason: `Could not import your repository into the platform account. (${
          push.timedOut ? "the import took too long" : redact(push.stderr).slice(0, 300)
        })`,
      };
    }

    // 3. Which commit did we just copy? HEAD of the bare clone is the default
    //    branch's tip, the same "HEAD" the Solver's test was pinned to. The
    //    caller uses it to re-verify a PASSED test. Failing to read it must
    //    never fail the mirror; it only means the test can't be re-verified.
    let mirroredCommitSha: string | null = null;
    try {
      const head = await runCommandTolerant(box, `git rev-parse HEAD`, { cwd: bareDir, timeoutMs: 10_000 });
      const sha = head.stdout.trim().toLowerCase();
      if (!head.timedOut && head.exitCode === 0 && /^[0-9a-f]{40}$/.test(sha)) mirroredCommitSha = sha;
    } catch {
      mirroredCommitSha = null;
    }

    return { ok: true, repo, mirroredCommitSha };
  } catch (err) {
    await deleteRepo(repo.fullName);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: `Repository import failed: ${redact(message).slice(0, 500)}`,
    };
  } finally {
    if (sandbox) {
      await sandbox.kill().catch(() => {
        // Best-effort — the sandbox's own timeoutMs guarantees teardown.
      });
    }
  }
}
