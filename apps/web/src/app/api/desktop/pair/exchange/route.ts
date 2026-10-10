import { clientIp } from "@/lib/desktop/ratelimit";
import { json, rateLimited, readSmallJson } from "@/lib/desktop/http";
import { exchangeCode } from "@/lib/desktop/pairing";

/**
 * Step 3 (unauthenticated): redeem the one-time code. Every failure reason
 * returns the SAME response so the endpoint can't be used to learn whether a
 * pairing exists, is expired, or was close.
 */
export async function POST(req: Request) {
  const body = await readSmallJson(req);
  if (!body) return json({ error: "Invalid or expired code", code: "invalid_code" }, 400);

  const r = await exchangeCode({
    pairingId: body.pairingId, code: body.code, codeVerifier: body.codeVerifier, ip: clientIp(req.headers),
  });
  if (r.kind === "rate_limited") return rateLimited(r.retryAfterSec);
  if (r.kind === "invalid") return json({ error: "Invalid or expired code", code: "invalid_code" }, 400);
  return json(r.tokens);
}
