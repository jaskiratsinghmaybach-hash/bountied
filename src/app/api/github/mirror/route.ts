import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mirrorSubmissionRepo } from "@/lib/github/mirror";

export async function POST(req: Request) {
  try {
    const { submissionId } = await req.json();

    if (!submissionId) {
      return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { problem: true, solver: true },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (!submission.solver.githubAccessToken) {
      return NextResponse.json({ error: "Solver has not connected GitHub" }, { status: 400 });
    }

    // Mirror the repository asynchronously or inline
    const mirrorResult = await mirrorSubmissionRepo({
      submissionId: submission.id,
      sourceRepoUrl: submission.repoUrl,
      solverToken: submission.solver.githubAccessToken,
      runtime: submission.problem.runtime,
      problemTitle: submission.problem.title,
    });

    if (!mirrorResult.ok) {
       return NextResponse.json({ error: mirrorResult.reason }, { status: 500 });
    }

    // Update submission state to AWAITING_REVIEW for lazy execution strategy
    await prisma.submission.update({
      where: { id: submission.id },
      data: {
        platformRepoUrl: mirrorResult.repo.cloneUrl,
        platformRepoFullName: mirrorResult.repo.fullName,
        status: "AWAITING_REVIEW",
      },
    });

    return NextResponse.json({ success: true, status: "AWAITING_REVIEW" });
  } catch (error) {
    console.error("Error mirroring repository:", error);
    return NextResponse.json(
      { error: "Failed to mirror repository" },
      { status: 500 }
    );
  }
}