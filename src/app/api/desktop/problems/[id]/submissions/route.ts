import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getDesktopUser, unauthorized } from "@/lib/desktop/auth";

/**
 * Submissions for one of the caller's problems.
 *
 * ZERO-SOURCE RULE: repoUrl and platformRepoUrl point at the Solver's code,
 * so they are returned ONLY when Submission.isRevealed is true (set solely by
 * acceptSubmissionAndRelease). Before release the Giver gets metadata and
 * review evidence only.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getDesktopUser(req);
  if (!user) return unauthorized();
  const { id } = await params;

  const problem = await prisma.problem.findUnique({ where: { id }, select: { giverId: true, status: true } });
  if (!problem) return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  if (problem.giverId !== user.id) return forbidden();

  const submissions = await prisma.submission.findMany({
    where: { problemId: id },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true, status: true, attemptNumber: true, submittedAt: true, writeup: true,
      isRevealed: true, sandboxExitCode: true, sandboxRanAt: true,
      repoUrl: true, platformRepoUrl: true,
      solver: { select: { name: true } },
    },
  });

  return NextResponse.json({
    problemStatus: problem.status,
    submissions: submissions.map(({ repoUrl, platformRepoUrl, solver, ...s }) => ({
      ...s,
      solverName: solver.name,
      repoUrl: s.isRevealed ? repoUrl : null,
      platformRepoUrl: s.isRevealed ? platformRepoUrl : null,
    })),
  });
}
