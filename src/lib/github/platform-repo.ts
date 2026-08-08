const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API = "https://api.github.com";

/**
 * Thin wrapper over the GitHub REST API for repositories owned by the
 * PLATFORM's own GitHub account (https://github.com/bountied-repositories).
 *
 * These calls authenticate with PLATFORM_GITHUB_TOKEN — a PAT belonging to
 * the platform account — NOT with a solver's OAuth token. A solver's token
 * can only read their own repos; it can never create anything under the
 * platform account. The two tokens are used at different steps of the
 * mirror (see lib/github/mirror.ts) and must not be interchanged.
 *
 * bountied-repositories is a USER account, not an org, so repos are created
 * via POST /user/repos. If it is ever converted to an organization, this is
 * the only file that has to change (POST /orgs/{org}/repos).
 */

export type PlatformRepo = {
  /** "bountied-repositories/sub-abc123" */
  fullName: string;
  /** "https://github.com/bountied-repositories/sub-abc123" */
  htmlUrl: string;
  /** Clone target — the same URL with .git; credentials are injected at push time. */
  cloneUrl: string;
};

export type PlatformRepoResult =
  | { ok: true; repo: PlatformRepo }
  | { ok: false; reason: string };

function platformToken(): string | null {
  const token = process.env.PLATFORM_GITHUB_TOKEN;
  return token && token.trim().length > 0 ? token : null;
}

export function platformOwner(): string {
  return process.env.PLATFORM_GITHUB_OWNER ?? "bountied-repositories";
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "Content-Type": "application/json",
  };
}

/**
 * Deterministic repo name for a submission. Submission ids are cuids, so
 * this is collision-free and gives every submission its own standalone
 * repo (no forks — a fork stays permanently linked to the solver's source
 * repo and cannot be made private when the parent is public).
 */
export function repoNameForSubmission(submissionId: string): string {
  return `sub-${submissionId}`;
}

/**
 * Creates a new PRIVATE repo under the platform account.
 *
 * Private on purpose: the submission's code must not be world-readable
 * before the giver pays. It is flipped to public by publishPlatformRepo()
 * from the escrow release path only — see lib/escrow/release.ts.
 *
 * auto_init is false so the repo has zero commits, which is what an
 * initial `git push --all` into it requires (an auto-initialised repo has
 * a README commit that the pushed history doesn't descend from, making the
 * push non-fast-forward).
 */
export async function createPlatformRepo(
  name: string,
  description?: string
): Promise<PlatformRepoResult> {
  const token = platformToken();
  if (!token) {
    return {
      ok: false,
      reason:
        "PLATFORM_GITHUB_TOKEN is not configured — the platform cannot create repositories.",
    };
  }

  const res = await fetch(`${GITHUB_API}/user/repos`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({
      name,
      description: description ?? "Submitted solution mirrored by Bountied.",
      private: true,
      auto_init: false,
      has_issues: false,
      has_wiki: false,
      has_projects: false,
    }),
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      reason:
        "The platform GitHub token was rejected (expired, revoked, or missing the 'repo' scope).",
    };
  }

  // 422 with "name already exists" means a previous attempt for this same
  // submission got partway through. Adopt the existing repo rather than
  // failing — the mirror push below is idempotent.
  if (res.status === 422) {
    const existing = await getPlatformRepo(name);
    if (existing.ok) return existing;
    return {
      ok: false,
      reason: `GitHub rejected the repository name "${name}".`,
    };
  }

  if (!res.ok) {
    return { ok: false, reason: `GitHub API error while creating repo (${res.status}).` };
  }

  const data = (await res.json()) as {
    full_name: string;
    html_url: string;
    clone_url: string;
  };

  return {
    ok: true,
    repo: {
      fullName: data.full_name,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
    },
  };
}

export async function getPlatformRepo(name: string): Promise<PlatformRepoResult> {
  const token = platformToken();
  if (!token) return { ok: false, reason: "PLATFORM_GITHUB_TOKEN is not configured." };

  const res = await fetch(`${GITHUB_API}/repos/${platformOwner()}/${name}`, {
    headers: headers(token),
    cache: "no-store",
  });

  if (!res.ok) {
    return { ok: false, reason: `Repository ${name} not found (${res.status}).` };
  }

  const data = (await res.json()) as {
    full_name: string;
    html_url: string;
    clone_url: string;
  };

  return {
    ok: true,
    repo: { fullName: data.full_name, htmlUrl: data.html_url, cloneUrl: data.clone_url },
  };
}

/**
 * Flips a mirrored repo from private to public.
 *
 * THIS IS THE REVEAL. Call it only from the escrow release path, after the
 * money has actually moved — making the repo public is exactly as
 * irreversible as handing the giver the source, because anyone can clone it
 * (and GitHub/third parties may index it) during any window it is public.
 */
export async function publishPlatformRepo(
  fullName: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const token = platformToken();
  if (!token) return { ok: false, reason: "PLATFORM_GITHUB_TOKEN is not configured." };

  const res = await fetch(`${GITHUB_API}/repos/${fullName}`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify({ private: false }),
    cache: "no-store",
  });

  if (!res.ok) {
    return {
      ok: false,
      reason: `Could not make ${fullName} public (GitHub returned ${res.status}).`,
    };
  }
  return { ok: true };
}

/**
 * Deletes a platform repo. Used to clean up after a mirror that failed
 * partway through, so a retry isn't blocked by a half-populated repo and
 * the platform account doesn't accumulate empty repos.
 *
 * Requires the 'delete_repo' scope on PLATFORM_GITHUB_TOKEN; if that scope
 * is missing this fails quietly (best-effort by design — the caller is
 * already handling a failure and must not mask it with a cleanup error).
 */
export async function deletePlatformRepo(fullName: string): Promise<void> {
  const token = platformToken();
  if (!token) return;

  await fetch(`${GITHUB_API}/repos/${fullName}`, {
    method: "DELETE",
    headers: headers(token),
    cache: "no-store",
  }).catch(() => {
    // Best-effort cleanup only.
  });
}
