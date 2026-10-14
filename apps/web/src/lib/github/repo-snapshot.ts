/**
 * Reads what the free preflight needs from a Solver's OWN repo through the
 * GitHub API, with no clone and no sandbox: the exact commit at the tip of the
 * default branch, the list of files at that commit, and the contents of
 * bountied.json, package.json and requirements.txt.
 *
 * Uses the SOLVER's token, read-only, never the platform token. The token goes
 * only into the Authorization header of requests to api.github.com: it is not
 * logged and never appears in an error message.
 *
 * Everything returned is Solver-controlled data and is untrusted.
 */

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 10_000;
/** A manifest or package.json bigger than this is not a real one; refuse rather than parse a huge blob. */
const MAX_FILE_BYTES = 200_000;
const SEGMENT = /^[A-Za-z0-9._-]+$/;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type RepoSnapshotResult = {
  ok: boolean;
  /** Present when !ok. Safe to show the Solver. */
  reason?: string;
  /** Present when ok: the 40-hex commit at the tip of the default branch. */
  commitSha?: string;
  files?: string[];
  bountiedJson?: string | null;
  packageJson?: string | null;
  requirementsTxt?: string | null;
};

export function parseGithubRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(repoUrl);
    if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") return null;
    const parts = parsed.pathname.replace(/^\/+/, "").replace(/\.git$/, "").split("/");
    if (parts.length !== 2) return null;
    const [owner, repo] = parts;
    if (!SEGMENT.test(owner) || !SEGMENT.test(repo) || owner === "." || owner === ".." || repo === "." || repo === "..") {
      return null;
    }
    return { owner, repo };
  } catch {
    return null;
  }
}

export async function fetchRepoSnapshot(params: {
  repoUrl: string;
  /** The Solver's own GitHub token. */
  token: string;
  /** Injected in tests. */
  fetchImpl?: FetchLike;
  /** Optional immutable commit requested by the Solver. */
  commitSha?: string;
}): Promise<RepoSnapshotResult> {
  const { repoUrl, token } = params;
  const doFetch: FetchLike = params.fetchImpl ?? ((url, init) => fetch(url, init));

  const target = parseGithubRepoUrl(repoUrl);
  if (!target) return { ok: false, reason: "That isn't a valid GitHub repository URL." };
  const { owner, repo } = target;

  const get = (path: string, accept = "application/vnd.github+json") =>
    doFetch(`${GITHUB_API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  const accessProblem = (status: number): string | null => {
    if (status === 401 || status === 403) {
      return "Could not read your repository (GitHub rejected the token, or it has no access to this repo). Reconnect GitHub in Settings.";
    }
    if (status === 404) return "Repository not found, or your GitHub account can't see it.";
    if (status === 409) return "This repository is empty. Commit and push your code first.";
    return null;
  };

  try {
    // 1. The commit at the tip of the default branch, and its tree.
    const requestedSha = params.commitSha;
    if (requestedSha !== undefined && !/^[0-9a-f]{40}$/.test(requestedSha)) {
      return { ok: false, reason: "The selected commit ID is invalid." };
    }
    const commitRes = await get(`/repos/${owner}/${repo}/commits/${requestedSha ?? "HEAD"}`);
    if (!commitRes.ok) {
      return { ok: false, reason: accessProblem(commitRes.status) ?? `GitHub returned an error (${commitRes.status}). Try again.` };
    }
    const commit = (await commitRes.json()) as { sha?: unknown; commit?: { tree?: { sha?: unknown } } };
    const commitSha = commit.sha;
    const treeSha = commit.commit?.tree?.sha;
    if (typeof commitSha !== "string" || !/^[0-9a-f]{40}$/.test(commitSha) || typeof treeSha !== "string" || !/^[0-9a-f]{40}$/.test(treeSha)) {
      return { ok: false, reason: "GitHub returned an unexpected response. Try again." };
    }

    // 2. Every file path at that commit.
    const treeRes = await get(`/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`);
    if (!treeRes.ok) {
      return { ok: false, reason: accessProblem(treeRes.status) ?? `GitHub returned an error (${treeRes.status}). Try again.` };
    }
    const tree = (await treeRes.json()) as {
      truncated?: boolean;
      tree?: Array<{ path?: unknown; type?: unknown; size?: unknown }>;
    };
    if (tree.truncated) {
      return { ok: false, reason: "This repository is too large to analyze automatically." };
    }
    const entries = Array.isArray(tree.tree) ? tree.tree : [];
    const sizes = new Map<string, number>();
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.type !== "blob" || typeof entry.path !== "string") continue;
      files.push(entry.path);
      if (typeof entry.size === "number") sizes.set(entry.path, entry.size);
    }

    // 3. The three root files the plan reads, at exactly that commit.
    const readRoot = async (name: string): Promise<{ ok: boolean; text: string | null; reason?: string }> => {
      if (!files.includes(name)) return { ok: true, text: null };
      if ((sizes.get(name) ?? 0) > MAX_FILE_BYTES) {
        return { ok: false, text: null, reason: `${name} is too large to be a real ${name}.` };
      }
      const res = await get(`/repos/${owner}/${repo}/contents/${name}?ref=${commitSha}`, "application/vnd.github.raw+json");
      if (!res.ok) {
        return { ok: false, text: null, reason: accessProblem(res.status) ?? `GitHub returned an error reading ${name} (${res.status}). Try again.` };
      }
      return { ok: true, text: await res.text() };
    };

    const [manifest, pkg, reqs] = await Promise.all([
      readRoot("bountied.json"),
      readRoot("package.json"),
      readRoot("requirements.txt"),
    ]);
    for (const r of [manifest, pkg, reqs]) {
      if (!r.ok) return { ok: false, reason: r.reason };
    }

    return {
      ok: true,
      commitSha,
      files,
      bountiedJson: manifest.text,
      packageJson: pkg.text,
      requirementsTxt: reqs.text,
    };
  } catch {
    // Deliberately no error text: nothing from the failure (which could carry request details) is passed on.
    return { ok: false, reason: "Could not reach GitHub. Try again in a moment." };
  }
}
