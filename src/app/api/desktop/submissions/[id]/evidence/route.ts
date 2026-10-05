import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getDesktopUser, unauthorized } from "@/lib/desktop/auth";

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
    error: s.sandboxError, ranAt: s.sandboxRanAt,
  });
}
