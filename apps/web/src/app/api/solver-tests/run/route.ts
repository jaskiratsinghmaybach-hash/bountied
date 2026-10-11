import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBody } from "@/lib/solver-tests/http";
import { handleRun } from "@/lib/solver-tests/handlers";
import { solverTestDeps } from "@/lib/solver-tests/deps";

/**
 * The sandbox keeps running after this route has answered 202 (see
 * solver-tests/deps.ts), so the function must be allowed to live that long:
 * clone + install + the retry ladder + the run is up to about 150 seconds.
 */
export const maxDuration = 180;

/**
 * Starts a billed (or free) Solver test. Identity comes from the session cookie
 * and the runtime from the Problem row, never from the body. Returns 202 with a
 * runId; poll GET /api/solver-tests/[runId] for the result.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Send a JSON body.", code: "BAD_REQUEST" }, { status: 400 });
  }
  try {
    const result = await handleRun(user, parsed.body, solverTestDeps);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error("Solver test run error:", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ error: "Could not start the test. Try again.", code: "SERVER_ERROR" }, { status: 500 });
  }
}
