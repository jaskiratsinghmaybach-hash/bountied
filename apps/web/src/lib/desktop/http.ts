import { NextResponse } from "next/server";

const noStore = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...noStore, ...extra } });
}

export function rateLimited(retryAfterSec: number) {
  return json(
    { error: `Too many attempts. Try again in ${retryAfterSec}s.`, code: "rate_limited", retryAfterSec },
    429,
    { "Retry-After": String(retryAfterSec) },
  );
}

/** Small JSON bodies only: these endpoints are unauthenticated entry points. */
export async function readSmallJson(req: Request): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > 4096) return null;
  try {
    const text = await req.text();
    if (text.length > 4096) return null;
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
