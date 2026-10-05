import { NextResponse } from "next/server";
import { getDesktopUser, unauthorized } from "@/lib/desktop/auth";
import { acceptSubmissionAndRelease } from "@/lib/escrow/release";

/**
 * Accept + release escrow. acceptSubmissionAndRelease is the ONLY writer of
 * isRevealed/escrow state and re-checks actingGiverId === Problem.giverId
 * itself; we pass the TOKEN-derived user id, never a client-supplied one.
 */
export async function POST(req: Request) {
  const user = await getDesktopUser(req);
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const problemId = typeof body?.problemId === "string" ? body.problemId : null;
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId : null;
  if (!problemId || !submissionId) {
    return NextResponse.json({ error: "Missing problemId or submissionId" }, { status: 400 });
  }

  const result = await acceptSubmissionAndRelease({ problemId, submissionId, actingGiverId: user.id });
  if (!result.ok) return NextResponse.json({ error: (result as { reason: string }).reason }, { status: 400 });
  return NextResponse.json({ ok: true });
}
