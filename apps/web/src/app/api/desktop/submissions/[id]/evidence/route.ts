import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getDesktopUser, unauthorized } from "@/lib/desktop/auth";
import { classifySubmissionFailure } from "@/lib/problems/submission-failure";

/** Bounded review evidence (see lib/sandbox/review-evidence.ts) for one submission. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getDesktopUser(req);
  if (!user) return unauthorized();
  const { id } = await params;

  const s = await prisma.submission.findUnique({
    where: { id },
    select: {
      status: true, isRevealed: true, sandboxOutput: true, sandboxExitCode: true,
      sandboxError: true, sandboxRanAt: true, problem: { select: { giverId: true } },
    },
  });
  if (!s) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (s.problem.giverId !== user.id) return forbidden();

  return NextResponse.json({
    status: s.status, isRevealed: s.isRevealed,
    exitCode: s.sandboxExitCode, output: s.sandboxOutput,
    // Zero-source: never the stored text itself (older rows hold the runner's raw
    // reason, which can echo the Solver's files). Only the fixed, classified summary.
    error: classifySubmissionFailure(s)?.summary ?? null, ranAt: s.sandboxRanAt,
  });
}
