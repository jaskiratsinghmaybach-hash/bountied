"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type CreateSubmissionResult =
  | { ok: true; submissionId: string }
  | { error: string };

/**
 * Creates a Submission row and immediately fires an async sandbox run
 * (via a POST to /api/sandbox/run, which returns fast and handles
 * execution in the background). The solver sees "Running..." instantly
 * rather than waiting 30 seconds on a form submit.
 *
 * Authorization rules enforced here:
 *  - Must be SOLVER or BOTH role
 *  - Problem must be OPEN
 *  - Solver must not already have a non-rejected submission on this problem
 *  - Solver must have a stored GitHub token (githubConnected)
 */
export async function createSubmission(
  problemId: string,
  _prevState: CreateSubmissionResult | undefined,
  formData: FormData
): Promise<CreateSubmissionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) return { error: "Profile not found." };
  if (profile.role !== "SOLVER" && profile.role !== "BOTH") {
    return { error: "Only solvers can submit solutions." };
  }
  if (!profile.githubConnected || !profile.githubAccessToken) {
    return {
      error:
        "Connect your GitHub account before submitting — you'll see a Connect GitHub option on this page.",
    };
  }

  const problem = await prisma.problem.findUnique({ where: { id: problemId } });
  if (!problem) return { error: "Problem not found." };
  if (problem.status !== "OPEN") {
    return { error: "This problem is no longer accepting submissions." };
  }

  // Prevent duplicate active submissions from the same solver
  const existing = await prisma.submission.findFirst({
    where: {
      problemId,
      solverId: user.id,
      status: { notIn: ["REJECTED", "SANDBOX_FAILED"] },
    },
  });
  if (existing) {
    return {
      error:
        "You already have an active submission on this problem. Wait for it to be reviewed, or check if it failed.",
    };
  }

  const repoUrl = String(formData.get("repoUrl") ?? "").trim();
  const writeup = String(formData.get("writeup") ?? "").trim();

  if (!repoUrl) return { error: "Select a repository from the dropdown." };
  if (!repoUrl.startsWith("https://github.com/")) {
    return { error: "Only GitHub repo URLs (https://github.com/...) are accepted." };
  }
  if (writeup.length < 30) {
    return { error: "Write at least 30 characters explaining what you built." };
  }

  // Create the submission immediately so the solver gets confirmation
  // and can see the "Running..." status — execution happens async below.
  const submission = await prisma.submission.create({
    data: {
      problemId,
      solverId: user.id,
      repoUrl,
      writeup,
      status: "RUNNING",
    },
  });

  // Kick off async sandbox execution. This returns fast (fire-and-forget
  // POST); the actual 30-second execution happens in the background and
  // updates the submission row when done. We use the absolute URL so this
  // works from both server-side and edge contexts.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  fetch(`${siteUrl}/api/sandbox/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sandbox-secret": process.env.SANDBOX_INTERNAL_SECRET ?? "",
    },
    body: JSON.stringify({ submissionId: submission.id }),
  }).catch(() => {
    // Best-effort — if this call fails, the submission stays RUNNING
    // and an admin can manually re-trigger or check E2B logs. The solver
    // sees "Running..." rather than a false error.
  });

  revalidatePath(`/problems/${problemId}`);
  return { ok: true, submissionId: submission.id };
}
