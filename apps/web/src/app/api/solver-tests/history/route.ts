import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { parseGithubRepoUrl } from "@/lib/github/repo-snapshot";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SHA = /^[0-9a-f]{40}$/i;

/**
 * Returns the signed-in Solver's most recent test for one exact problem/repo/SHA.
 * This endpoint is deliberately owner-scoped: Givers never receive Solver output.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to load test history." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const url = new URL(request.url);
  const problemId = url.searchParams.get("problemId") ?? "";
  const repoRaw = url.searchParams.get("repoUrl") ?? "";
  const commitSha = (url.searchParams.get("commitSha") ?? "").toLowerCase();
  const repo = parseGithubRepoUrl(repoRaw);

  if (!ID.test(problemId) || !repo || !SHA.test(commitSha)) {
    return NextResponse.json({ error: "A valid bounty, repository, and full commit SHA are required." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const repoUrl = `https://github.com/${repo.owner}/${repo.repo}`;
  const run = await prisma.solverTestRun.findFirst({
    where: { solverId: user.id, problemId, repoUrl, commitSha },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      isFree: true,
      commitSha: true,
      exitCode: true,
      output: true,
      errorCode: true,
      errorMessage: true,
      refundedAt: true,
    },
  });

  if (!run) {
    return NextResponse.json({ found: false }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({
    found: true,
    run: {
      runId: run.id,
      status: run.status,
      free: run.isFree,
      commitSha: run.commitSha,
      exitCode: run.exitCode,
      output: run.output,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
      docsUrl: null,
      refunded: !!run.refundedAt,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
