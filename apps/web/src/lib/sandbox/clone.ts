/**
 * Builds the `git clone` step for the E2B sandbox WITHOUT ever putting the
 * platform's GitHub token somewhere the Solver's code can read it.
 *
 * Before: the token was embedded in the clone URL
 * (https://x-access-token:<token>@github.com/...), which git writes into
 * <repo>/.git/config. The Solver's code then runs in that same directory and
 * could print the token (and the platform token can read EVERY solver's
 * mirrored repo).
 *
 * Now: the clone URL carries no credentials. The token is handed to the one
 * git process as an HTTP auth header through an environment variable that
 * exists only for that single command, so it is never written to disk, never
 * part of the command line, and never part of any error message.
 *
 * Pure (no E2B import) so it can be unit-tested.
 */

/** Flat result (not a union) so it narrows under this repo's `strict: false`. */
export type ClonePlan = {
  ok: boolean;
  /** Present when ok. Safe to run: contains no secrets. */
  command?: string;
  /** Present when ok. Pass as the command's `envs`; this is where the secret lives. */
  envs?: Record<string, string>;
  /** Present when !ok. */
  reason?: string;
};

// Only a plain /owner/repo path may be placed inside the double-quoted shell argument.
const REPO_PATH = /^\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
// workDir is platform-chosen, but it also lands inside a shell string - keep it plain.
const WORK_DIR = /^\/[A-Za-z0-9._/-]+$/;

export function planClone(repoUrl: string, workDir: string, githubToken: string): ClonePlan {
  if (!WORK_DIR.test(workDir)) return { ok: false, reason: "Invalid working directory." };

  let cloneUrl: string;
  try {
    const parsed = new URL(repoUrl);
    if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
      return { ok: false, reason: "Only GitHub repo URLs are accepted." };
    }
    if (!REPO_PATH.test(parsed.pathname)) {
      return { ok: false, reason: "Invalid repo URL." };
    }
    // Rebuilt from parts: any credentials, query string or fragment in the stored URL are dropped.
    cloneUrl = `https://github.com${parsed.pathname}`;
  } catch {
    return { ok: false, reason: "Invalid repo URL." };
  }

  const envs: Record<string, string> = { GIT_TERMINAL_PROMPT: "0" };
  let command: string;
  if (githubToken) {
    envs.BOUNTIED_GIT_AUTH = Buffer.from(`x-access-token:${githubToken}`).toString("base64");
    command = `git -c "http.extraHeader=Authorization: Basic $BOUNTIED_GIT_AUTH" clone --depth 1 "${cloneUrl}" "${workDir}"`;
  } else {
    command = `git clone --depth 1 "${cloneUrl}" "${workDir}"`;
  }
  return { ok: true, command, envs };
}

/** Removes the token (raw and base64 forms) from any text that might be stored or shown. */
export function redactSecrets(text: string, githubToken: string): string {
  if (!githubToken) return text;
  const b64 = Buffer.from(`x-access-token:${githubToken}`).toString("base64");
  return text.split(githubToken).join("***").split(b64).join("***");
}
