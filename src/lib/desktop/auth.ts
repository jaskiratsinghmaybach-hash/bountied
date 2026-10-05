import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION } from "./config";
import { hmac } from "./crypto";
import { clientIp } from "./ratelimit";

/**
 * Bearer auth for the Bountied Desktop client (/api/desktop/*).
 *
 * The token is an opaque, short-lived device access token issued by the
 * pairing flow (lib/desktop/pairing.ts) - NOT a Supabase token. It is looked
 * up by HMAC on every request, so revoking a device in Integrations takes
 * effect on the very next call. Identity comes only from this lookup, never
 * from anything in the request body or URL.
 */
export async function getDesktopAuth(req: Request) {
  const match = /^Bearer\s+(\S{20,200})$/i.exec(req.headers.get("authorization") ?? "");
  if (!match) return null;

  const now = new Date();
  const session = await prisma.deviceSession.findUnique({
    where: { accessTokenHash: hmac("access", match[1]) },
    include: { user: true },
  });
  if (
    !session || session.revokedAt ||
    session.accessExpiresAt <= now || session.absoluteExpiresAt <= now
  ) return null;

  if (now.getTime() - session.lastSeenAt.getTime() > SESSION.lastSeenThrottleSec * 1000) {
    const ip = clientIp(req.headers);
    void prisma.deviceSession
      .update({ where: { id: session.id }, data: { lastSeenAt: now, lastIp: ip === "unknown" ? undefined : ip } })
      .catch(() => {});
  }
  return { user: session.user, sessionId: session.id };
}

export async function getDesktopUser(req: Request) {
  return (await getDesktopAuth(req))?.user ?? null;
}

const noStore = { "Cache-Control": "no-store" };

export const unauthorized = () =>
  NextResponse.json({ error: "Not authenticated" }, { status: 401, headers: noStore });

export const forbidden = () =>
  NextResponse.json({ error: "Not authorized" }, { status: 403, headers: noStore });
