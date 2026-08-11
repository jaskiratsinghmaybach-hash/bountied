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
 *
 * The name being derivable from a visible submission id is fine and
 * intentional — see the note on createPlatformRepo below. The repo stays
 * private forever regardless, so guessing the name grants nothing.
 */
export function repoNameForSubmission(submissionId: string): string {
  return `sub-${submissionId}`;
}

/**
 * Creates a new PRIVATE repo under the platform account.
 *
 * PRIVATE FOREVER (revised 2026-08-09) — not just until release. This repo
 * previously became public via publishPlatformRepo() on escrow release,
 * which was a real vulnerability: repoNameForSubmission() derives the name
 * from the submission id, which is visible elsewhere in the app, so any
 * public repo was enumerable by anyone who had used the platform, not just
 * the giver who paid. That function has been removed. The only reveal
 * mechanism now is a per-repo, per-giver collaborator invite — see
 * lib/github/grant-access.ts, called only from lib/escrow/release.ts after
 * escrow actually releases. Do not add a function that flips a mirror
 * repo's visibility to public; there is no correct reason to.
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
 * REMOVED (2026-08-09): this file used to export publishPlatformRepo(),
 * which PATCHed a mirror repo to private:false. That function granted
 * access to EVERYONE, not just the giver who paid — see the note on
 * createPlatformRepo above for why. It has been deleted, not deprecated,
 * so nothing can accidentally call it again. The real reveal is
 * grantGiverRepoAccess() in lib/github/grant-access.ts.
 */

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