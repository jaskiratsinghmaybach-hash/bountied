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

  // Every failure branch below used to guess at WHY from the status code
  // alone (e.g. assuming 422 always means "bad username") rather than
  // reading GitHub's own error body. That guess was actively misleading
  // in a real case: a 422 on this endpoint, per GitHub's docs, means
  // "validation failed" generically — most often a scope/permission
  // problem on PLATFORM_GITHUB_TOKEN, NOT a malformed username — but the
  // old message told the giver to go re-check their own username, which
  // sent them chasing the wrong fix (re-authing their own GitHub
  // connection, which this endpoint never even uses — see this file's
  // top doc comment on why only PLATFORM_GITHUB_TOKEN matters here).
  //
  // Surfacing just the top-level "message" field (first fix,
  // 2026-09-30) turned out to still be unhelpful in practice — GitHub's
  // real 422 response for this is {"message": "Validation Failed",
  // "errors": [{resource, field, code}], "documentation_url": "..."}.
  // The useful detail lives in errors[], not message — "Validation
  // Failed" alone (confirmed live: a real "Retry invite" attempt showed
  // exactly this and nothing more useful) tells a giver nothing actionable.
  // Build the real reason from errors[] when present.
  let githubMessage: string | null = null;
  let githubDocsUrl: string | null = null;
  try {
    const body = (await res.json()) as {
      message?: string;
      errors?: Array<{ resource?: string; field?: string; code?: string; message?: string }>;
      documentation_url?: string;
    };
    githubDocsUrl = typeof body.documentation_url === "string" ? body.documentation_url : null;

    if (Array.isArray(body.errors) && body.errors.length > 0) {
      const detail = body.errors
        .map((e) => {
          if (e.message) return e.message;
          const parts = [e.resource, e.field, e.code].filter(Boolean);
          return parts.length > 0 ? parts.join(" ") : null;
        })
        .filter((s): s is string => !!s)
        .join("; ");
      githubMessage = detail
        ? `${body.message ?? "Validation failed"}: ${detail}`
        : (body.message ?? null);
    } else {
      githubMessage = typeof body.message === "string" ? body.message : null;
    }
  } catch {
    // Non-JSON or empty body — fall through to the generic message below.
  }

  if (res.status === 404) {
    return {
      ok: false,
      reason:
        githubMessage ??
        "Could not find the mirrored repository, or the platform token no longer has access to it.",
    };
  }
  if (res.status === 403) {
    return {
      ok: false,
      reason:
        githubMessage ??
        "The platform GitHub token doesn't have permission to add collaborators (check its scopes).",
    };
  }
  if (res.status === 422) {
    const docsSuffix = githubDocsUrl ? ` (${githubDocsUrl})` : "";
    return {
      ok: false,
      reason: githubMessage
        ? `GitHub rejected the invite: ${githubMessage}${docsSuffix}`
        : `GitHub rejected the invite for an unspecified reason (422). This is usually a permission/scope issue on the platform's GitHub token, not the giver's username.`,
    };
  }

  return {
    ok: false,
    reason: githubMessage
      ? `GitHub API error (${res.status}): ${githubMessage}`
      : `GitHub API error (${res.status}).`,
  };
}