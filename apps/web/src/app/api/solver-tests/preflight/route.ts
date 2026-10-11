import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBody } from "@/lib/solver-tests/http";
import { handlePreflight } from "@/lib/solver-tests/handlers";
import { solverTestDeps } from "@/lib/solver-tests/deps";

/**
 * Free check of a Solver's repo before they spend anything: what will run, what
 * to fix, and what a test would cost. Identity comes from the session cookie,
 * never from the body.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Send a JSON body.", code: "BAD_REQUEST" }, { status: 400 });
  }
  try {
    const result = await handlePreflight(user, parsed.body, solverTestDeps);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error("Solver test preflight error:", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ error: "Could not check your repository. Try again.", code: "SERVER_ERROR" }, { status: 500 });
  }
}
