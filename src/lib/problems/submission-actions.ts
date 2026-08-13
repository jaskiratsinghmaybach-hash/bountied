"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function createSubmission(data: {
  problemId: string;
  solverId: string;
  repoUrl: string;
  writeup: string;
}) {
  const submission = await prisma.submission.create({
    data: {
      problemId: data.problemId,
      solverId: data.solverId,
      repoUrl: data.repoUrl,
      writeup: data.writeup,
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
  return submission;
}