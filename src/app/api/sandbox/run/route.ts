import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ReviewError, startAndRunReview } from "@/lib/reviews/start-review";

/**
 * Giver clicks "Run sandbox review" on the website.
 *
 * Identity comes ONLY from the Supabase session cookie. The caller must be
 * the Giver of the submission's problem; the charge and the run happen
 * together inside startAndRunReview (lib/reviews/start-review.ts).
 */
export async function POST(req: Request) {
  // A JSON content type can't be sent cross-site without a CORS preflight, which
  // we never approve - cheap CSRF defence on top of SameSite session cookies.
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId : null;
  if (!submissionId) return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });

  try {
    const { problemId, outcome } = await startAndRunReview(submissionId, user.id);
    revalidatePath(`/dashboard/giver/problems/${problemId}`);
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status ?? 500 });
    }
    // Deliberately not the whole submission row (it contains the mirror repo URL).
    return NextResponse.json({ success: true, status: outcome.submission?.status });
  } catch (e) {
    if (e instanceof ReviewError) {
      const status = { NOT_FOUND: 404, FORBIDDEN: 403, NOT_READY: 409, INSUFFICIENT_FUNDS: 402 }[e.code];
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error("Sandbox review error:", e);
    return NextResponse.json({ error: "Sandbox execution failed" }, { status: 500 });
  }
}
