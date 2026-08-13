import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSandboxExecution } from "@/lib/sandbox/runner";

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

    if (!submission || !submission.platformRepoFullName) {
      return NextResponse.json(
        { error: "Submission or mirrored repo not ready" },
        { status: 400 }
      );
    }

    // Update status to RUNNING
    await prisma.submission.update({
      where: { id: submission.id },
      data: { status: "RUNNING" },
    });

    // Execute code in E2B sandbox
    const result = await runSandboxExecution({
      repoFullName: submission.platformRepoFullName,
      runCommand: submission.problem.runCommand,
      runtime: submission.problem.runtime,
    });

    // Save logs and exit code
    const isSuccess = result.exitCode === 0;
    const updatedSubmission = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        sandboxOutput: result.output,
        sandboxExitCode: result.exitCode,
        sandboxError: result.error ?? null,
        sandboxRanAt: new Date(),
        status: isSuccess ? "UNDER_REVIEW" : "SANDBOX_FAILED",
      },
    });

    return NextResponse.json({ success: true, submission: updatedSubmission });
  } catch (error) {
    console.error("Sandbox execution error:", error);
    return NextResponse.json(
      { error: "Sandbox execution failed" },
      { status: 500 }
    );
  }
}