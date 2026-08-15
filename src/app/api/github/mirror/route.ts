import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
// @ts-ignore
import { mirrorRepository } from "@/lib/github/mirror";

export async function POST(req: Request) {
  try {
    const { submissionId } = await req.json();

    if (!submissionId) {
      return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { problem: true },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // Mirror the repository asynchronously or inline
    // @ts-ignore
    const mirrorResult = await mirrorRepository({
      submissionId: submission.id,
      sourceRepoUrl: submission.repoUrl,
    });

    // Update submission state to AWAITING_REVIEW for lazy execution strategy
    await prisma.submission.update({
      where: { id: submission.id },
      data: {
        platformRepoUrl: mirrorResult.url,
        platformRepoFullName: mirrorResult.fullName,
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