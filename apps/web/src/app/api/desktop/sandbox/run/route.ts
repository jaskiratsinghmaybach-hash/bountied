import { NextResponse } from "next/server";
import { getDesktopUser, unauthorized } from "@/lib/desktop/auth";
import { ReviewError, startAndRunReview } from "@/lib/reviews/start-review";

/**
 * Billed sandbox review, initiated from Bountied Desktop. Identity comes from
 * the verified device token - never from the request body. Ownership, status,
 * charging and the run all happen inside startAndRunReview.
 */
export async function POST(req: Request) {
  const user = await getDesktopUser(req);
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId : null;
  if (!submissionId) return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });

  try {
    const { outcome } = await startAndRunReview(submissionId, user.id);
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status ?? 500 });
    }
    return NextResponse.json({ success: true, status: outcome.submission?.status });
  } catch (e) {
    if (e instanceof ReviewError) {
      const status = { NOT_FOUND: 404, FORBIDDEN: 403, NOT_READY: 409, INSUFFICIENT_FUNDS: 402 }[e.code];
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error("Desktop sandbox review error:", e);
    return NextResponse.json({ error: "Sandbox execution failed" }, { status: 500 });
  }
}
