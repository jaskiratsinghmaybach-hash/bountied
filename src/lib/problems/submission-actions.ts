"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

export type CreateSubmissionResult =
  | { error: string }
  | { ok: true; submissionId: string };

export async function createSubmission(
  problemId: string,
  _prevState: CreateSubmissionResult | undefined,
  formData: FormData
): Promise<CreateSubmissionResult> {
  const repoUrl = String(formData.get("repoUrl") ?? "").trim();
  const writeup = String(formData.get("writeup") ?? "").trim();

  if (!repoUrl) {
    return { error: "Select a GitHub repository before submitting." };
  }

  if (writeup.length < 30) {
    return { error: "Writeup must be at least 30 characters long." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be logged in to submit." };
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, status: true },
  });

  if (!problem) {
    return { error: "Problem not found." };
  }

  if (problem.status !== "OPEN") {
    return { error: "This problem is no longer accepting submissions." };
  }

  const existingSubmission = await prisma.submission.findFirst({
    where: { problemId, solverId: user.id },
    select: { id: true },
  });

  if (existingSubmission) {
    return { error: "You already submitted a solution for this problem." };
  }

  const submission = await prisma.submission.create({
    data: {
      problemId,
      solverId: user.id,
      repoUrl,
      writeup,
      status: "SUBMITTED",
    },
  });

  // Trigger non-blocking asynchronous mirror job
  fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/github/mirror`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionId: submission.id }),
  }).catch((err) => console.error("Mirror trigger error:", err));

  revalidatePath("/dashboard/solver/submissions");
  return { ok: true, submissionId: submission.id };
}