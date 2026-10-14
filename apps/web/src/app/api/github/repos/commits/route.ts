import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { decryptGithubTokenOrNull } from "@/lib/security/github-token";
import { parseGithubRepoUrl } from "@/lib/github/repo-snapshot";

export const dynamic = "force-dynamic";
const SHA = /^[0-9a-f]{40}$/;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to view commit history." }, { status: 401 });
  const token = decryptGithubTokenOrNull(user.githubAccessToken);
  if (!token) return NextResponse.json({ error: "Connect GitHub to view commit history." }, { status: 409 });
  const url = new URL(req.url);
  const repoUrl = url.searchParams.get("repoUrl") ?? "";
  const target = parseGithubRepoUrl(repoUrl);
  if (!target) return NextResponse.json({ error: "Invalid repository URL." }, { status: 400 });
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("perPage") ?? 50) || 50));
  const page = Math.min(100, Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1));
  try {
    const response = await fetch(`https://api.github.com/repos/${target.owner}/${target.repo}/commits?per_page=${perPage}&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404) return NextResponse.json({ error: "Repository not found or no longer accessible. Reconnect GitHub or check repository permissions." }, { status: 404 });
    if (!response.ok) return NextResponse.json({ error: response.status === 403 ? "GitHub rate limit or permissions prevented loading history. Try again shortly." : `GitHub could not load history (${response.status}).` }, { status: response.status === 403 ? 429 : 502 });
    const raw = await response.json() as Array<{ sha?: string; html_url?: string; commit?: { message?: string; author?: { name?: string; date?: string }; committer?: { date?: string } }; author?: { login?: string; avatar_url?: string } | null }>;
    const commits = raw.filter(c => typeof c.sha === "string" && SHA.test(c.sha)).map(c => ({
      sha: c.sha as string, shortSha: (c.sha as string).slice(0, 7),
      message: (c.commit?.message ?? "Commit").split("\n")[0].slice(0, 180),
      author: c.author?.login ?? c.commit?.author?.name ?? "Unknown author",
      date: c.commit?.author?.date ?? c.commit?.committer?.date ?? null,
      url: typeof c.html_url === "string" ? c.html_url : null,
      avatarUrl: c.author?.avatar_url ?? null,
      available: true,
    }));
    return NextResponse.json({ commits, page, perPage, hasMore: raw.length === perPage }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not reach GitHub to load commit history." }, { status: 502 });
  }
}
