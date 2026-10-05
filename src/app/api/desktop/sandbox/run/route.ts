import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getDesktopUser, unauthorized } from "@/lib/desktop/auth";
import { triggerSubmissionReview } from "@/lib/reviews/actions";
import { runAndRecordSubmission } from "@/lib/sandbox/run-submission";

/**
 * Billed sandbox review, initiated by the problem's Giver. Identity comes
 * from the verified Bearer token — never from the request body.
 */
export async function POST(req: Request) {
  const user = await getDesktopUser(req);
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId : null;
  if (!submissionId) return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { status: true, problem: { select: { giverId: true } } },
  });
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (submission.problem.giverId !== user.id) return forbidden();
  if (submission.status === "RUNNING") {
    return NextResponse.json({ error: "A review is already running" }, { status: 409 });
  }

  try {
    await triggerSubmissionReview(submissionId, user.id); // charges credit / consumes a free review
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "INSUFFICIENT_FUNDS") {
      return NextResponse.json({ error: "Insufficient credit for a review" }, { status: 402 });
    }
    return NextResponse.json({ error: "Could not start review" }, { status: 400 });
  }

  const outcome = await runAndRecordSubmission(submissionId);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status ?? 500 });
  return NextResponse.json({ success: true, status: outcome.submission.status });
}
