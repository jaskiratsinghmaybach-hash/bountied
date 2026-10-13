/**
 * Reads bountied.json straight from the SOLVER's own repo via the GitHub
 * Contents API — no clone, no sandbox. This exists purely so
 * lib/sandbox/bountied-manifest.ts can check a Giver's optional
 * dependencyPolicy BEFORE anything gets mirrored or booted (see product
 * decision 2026-09-02): a policy violation caught here costs one HTTP call,
 * not a mirror + sandbox boot.
 *
 * Replaces fetch-requirements.ts (product decision 2026-09-26 — bountied.json
 * is now the one manifest file every runtime reads, not a per-language file).
 *
 * Uses the SOLVER's OAuth token (same one lib/github/mirror.ts uses for the
 * clone step) — read-only, same as that call. Never the platform token;
 * this repo hasn't been mirrored yet at the point this runs.
 */

import { parseGithubRepoUrl } from "./repo-snapshot";

const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API = "https://api.github.com";

export type FetchManifestResult =
  | { ok: true; content: string | null } // null = file doesn't exist, not an error
  | { ok: false; reason: string };

/**
 * repoUrl is the solver's https://github.com/{owner}/{repo} submission URL
 * (Submission.repoUrl). Only ever called before mirroring — once
 * platformRepoUrl exists, execute.ts reads bountied.json itself inside
 * the sandbox as part of the normal install step.
 */
export async function fetchBountiedManifest(params: {
  repoUrl: string;
  solverToken: string;
  path?: string; // defaults to root bountied.json
}): Promise<FetchManifestResult> {
  const { repoUrl, solverToken, path = "bountied.json" } = params;

  // Strict, like every other place a Solver-supplied URL becomes a request: https,
  // github.com, exactly owner/repo made of letters, digits, dot, dash, underscore.
  const target = parseGithubRepoUrl(repoUrl);
  if (!target) {
    return { ok: false, reason: "Only plain https://github.com/owner/repo URLs are accepted." };
  }
  const { owner, repo } = target;

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${solverToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      cache: "no-store",
    }
  );

  // No bountied.json at all is a legitimate, common case (pure-stdlib
  // solution, or the solver hasn't run their AI assistant's generation
  // step yet) — not a failure. Let the caller decide what that means.
  if (res.status === 404) {
    return { ok: true, content: null };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      reason:
        "Could not read your repository (GitHub token rejected or missing repo access).",
    };
  }

  if (!res.ok) {
    return { ok: false, reason: `GitHub API error while reading bountied.json (${res.status}).` };
  }

  const data = (await res.json()) as { content?: string; encoding?: string; type?: string };

  if (data.type !== "file" || typeof data.content !== "string") {
    // path exists but is a directory, submodule, etc. — treat like "no file"
    // rather than erroring; the dependency policy simply has nothing to check.
    return { ok: true, content: null };
  }

  // GitHub Contents API returns base64 with embedded newlines.
  const decoded = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
  return { ok: true, content: decoded };
}
