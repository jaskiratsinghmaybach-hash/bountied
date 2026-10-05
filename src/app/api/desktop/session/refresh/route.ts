import { clientIp } from "@/lib/desktop/ratelimit";
import { json, rateLimited, readSmallJson } from "@/lib/desktop/http";
import { refreshSession } from "@/lib/desktop/pairing";

/**
 * Rotates the refresh token and issues a new short-lived access token. Any
 * failure (revoked, expired, unknown, replayed old token) is a flat 401: the
 * app must send the user back through pairing.
 */
export async function POST(req: Request) {
  const body = await readSmallJson(req);
  if (!body) return json({ error: "Session ended", code: "pairing_required" }, 401);

  const r = await refreshSession({ refreshToken: body.refreshToken, ip: clientIp(req.headers) });
  if (r.kind === "rate_limited") return rateLimited(r.retryAfterSec);
  if (r.kind === "invalid") return json({ error: "Session ended", code: "pairing_required" }, 401);
  return json({ accessToken: r.accessToken, refreshToken: r.refreshToken, expiresIn: r.expiresIn });
}
