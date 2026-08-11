const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API = "https://api.github.com";

/**
 * Invites a giver as a read-only collaborator on a platform-owned mirror
 * repo (see lib/github/platform-repo.ts, lib/github/mirror.ts).
 *
 * THIS IS THE REVEAL — replaces the earlier publishPlatformRepo() design,
 * which flipped a mirror repo to public. That was a real vulnerability:
 * repoNameForSubmission() derives the repo name from the submission id,
 * which is visible elsewhere in the app (problem/submission URLs), so a
 * public repo was enumerable by ANYONE who had used the platform, not
 * just the giver who paid for that specific submission.
 *
 * Mirror repos now stay PRIVATE forever. The only way in is a specific
 * collaborator invite issued to the specific giver who paid, sent with
 * PLATFORM_GITHUB_TOKEN (the platform account owns the mirror, so only
 * its own token can add collaborators to it — a giver's or solver's
 * token has no authority over a repo neither of them owns).
 *
 * GitHub's collaborator-invite endpoint is idempotent by design: calling
 * it again for someone who is already a collaborator (or has a pending
 * invite) returns 204 rather than erroring, so retrying this call for the
 * same submission/giver pair is always safe.
 */
export type GrantAccessResult =
  | { ok: true; alreadyCollaborator: boolean }
  | { ok: false; reason: string };

function platformToken(): string | null {
  const token = process.env.PLATFORM_GITHUB_TOKEN;
  return token && token.trim().length > 0 ? token : null;
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "Content-Type": "application/json",
  };
}

export async function grantGiverRepoAccess(params: {
  /** "bountied-repositories/sub-abc123" — the platform-owned mirror, never the solver's original repo. */
  platformRepoFullName: string;
  giverGithubUsername: string;
}): Promise<GrantAccessResult> {
  const { platformRepoFullName, giverGithubUsername } = params;

  const token = platformToken();
  if (!token) {
    return { ok: false, reason: "PLATFORM_GITHUB_TOKEN is not configured." };
  }

  const res = await fetch(
    `${GITHUB_API}/repos/${platformRepoFullName}/collaborators/${giverGithubUsername}`,
    {
      method: "PUT",
      headers: headers(token),
      body: JSON.stringify({ permission: "pull" }), // read-only — giver never needs write access
      cache: "no-store",
    }
  );

  // 201 = a new invitation was created and sent.
  // 204 = the user was already a collaborator or the invite already
  //       exists — safe to treat as success, this call is idempotent.
  if (res.status === 201) return { ok: true, alreadyCollaborator: false };
  if (res.status === 204) return { ok: true, alreadyCollaborator: true };

  if (res.status === 404) {
    return {
      ok: false,
      reason:
        "Could not find the mirrored repository, or the platform token no longer has access to it.",
    };
  }
  if (res.status === 403) {
    return {
      ok: false,
      reason:
        "The platform GitHub token doesn't have permission to add collaborators (check its scopes).",
    };
  }
  if (res.status === 422) {
    return {
      ok: false,
      reason: `GitHub could not process the invite — check that "${giverGithubUsername}" is a valid GitHub username.`,
    };
  }

  return { ok: false, reason: `GitHub API error (${res.status}).` };
}