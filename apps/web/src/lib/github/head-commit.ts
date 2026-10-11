import { parseGithubRepoUrl } from "./repo-snapshot";
import type { FetchLike } from "./repo-snapshot";

const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type HeadCommitResult = {
  ok: boolean;
  /** ok only: the 40-hex commit at the tip of the default branch. */
  commitSha?: string;
  /** failure only. Safe to show the Solver. */
  reason?: string;
};

/**
 * The commit at the tip of a repo's default branch, with the Solver's own
 * token, in ONE GitHub call. Used at submit time to re-verify that the repo is
 * still at the commit a passing test ran on. The same endpoint, and the same
 * "HEAD" meaning, as the preflight snapshot (lib/github/repo-snapshot.ts).
 */
export async function fetchHeadCommitSha(params: {
  repoUrl: string;
  /** The Solver's own GitHub token. */
  token: string;
  /** Injected in tests. */
  fetchImpl?: FetchLike;
}): Promise<HeadCommitResult> {
  const target = parseGithubRepoUrl(params.repoUrl);
  if (!target) return { ok: false, reason: "That isn't a valid GitHub repository URL." };
  const doFetch: FetchLike = params.fetchImpl ?? ((url, init) => fetch(url, init));

  try {
    const res = await doFetch(`${GITHUB_API}/repos/${target.owner}/${target.repo}/commits/HEAD`, {
      headers: {
        Authorization: `Bearer ${params.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        reason: "Could not read your repository (GitHub rejected the token, or it has no access to this repo). Reconnect GitHub in Settings.",
      };
    }
    if (res.status === 404) return { ok: false, reason: "Repository not found, or your GitHub account can't see it." };
    if (res.status === 409) return { ok: false, reason: "This repository is empty. Commit and push your code first." };
    if (!res.ok) return { ok: false, reason: `GitHub returned an error (${res.status}). Try again.` };

    const body = (await res.json()) as { sha?: unknown };
    if (typeof body.sha !== "string" || !/^[0-9a-f]{40}$/.test(body.sha)) {
      return { ok: false, reason: "GitHub returned an unexpected response. Try again." };
    }
    return { ok: true, commitSha: body.sha };
  } catch {
    return { ok: false, reason: "Could not reach GitHub. Try again in a moment." };
  }
}
