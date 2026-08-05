import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

const GITHUB_API_VERSION = "2022-11-28";

export type GithubRepoOption = {
  fullName: string; // "owner/repo"
  htmlUrl: string; // "https://github.com/owner/repo"
  private: boolean;
  updatedAt: string;
};

/**
 * Lists the signed-in solver's GitHub repos (public and private, anything
 * their stored token grants access to) so the submission form can offer a
 * real dropdown instead of a free-text URL field — eliminates the whole
 * class of "typo'd the URL, sandbox fails later" failures.
 *
 * The token itself never leaves the server — this route uses it to call
 * GitHub on the solver's behalf and returns only the repo metadata needed
 * to render the dropdown.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { githubAccessToken: true, githubConnected: true },
  });

  if (!profile?.githubConnected || !profile.githubAccessToken) {
    return NextResponse.json({ error: "GitHub not connected" }, { status: 422 });
  }

  // /user/repos, most-recently-updated first, capped at 100 per page —
  // fine for v1; a solver with 100+ repos needing pagination is a real
  // edge case to revisit later, not a v1 blocker.
  const res = await fetch(
    "https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator",
    {
      headers: {
        Authorization: `Bearer ${profile.githubAccessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      // Never cache — repo list and token validity can change at any time.
      cache: "no-store",
    }
  );

  if (res.status === 401) {
    // Token expired or was revoked on GitHub's side — tell the solver to
    // reconnect rather than surfacing a raw GitHub error.
    return NextResponse.json(
      { error: "Your GitHub connection has expired. Reconnect GitHub to see your repos." },
      { status: 401 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `GitHub API error (${res.status})` },
      { status: 502 }
    );
  }

  const repos = (await res.json()) as Array<{
    full_name: string;
    html_url: string;
    private: boolean;
    updated_at: string;
  }>;

  const options: GithubRepoOption[] = repos.map((r) => ({
    fullName: r.full_name,
    htmlUrl: r.html_url,
    private: r.private,
    updatedAt: r.updated_at,
  }));

  return NextResponse.json({ repos: options });
}
