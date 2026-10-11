import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleStatus } from "@/lib/solver-tests/handlers";
import { solverTestDeps } from "@/lib/solver-tests/deps";

/** The owner's view of one Solver test run (status, output, diagnosis). Anyone else gets a 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const user = await getCurrentUser();
  const { runId } = await params;
  try {
    const result = await handleStatus(user, runId, solverTestDeps);
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("Solver test status error:", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ error: "Could not load this test.", code: "SERVER_ERROR" }, { status: 500 });
  }
}
