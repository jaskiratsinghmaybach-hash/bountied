import { clientIp } from "@/lib/desktop/ratelimit";
import { json, rateLimited, readSmallJson } from "@/lib/desktop/http";
import { PAIRING } from "@/lib/desktop/config";
import { startPairing } from "@/lib/desktop/pairing";

/**
 * Step 1 (unauthenticated): the Desktop app announces itself and commits to a
 * PKCE challenge. Returns an opaque pairing id; the app opens
 * {site}/desktop/connect?req=<id> in the user's browser.
 */
export async function POST(req: Request) {
  const body = await readSmallJson(req);
  if (!body) return json({ error: "Bad request" }, 400);

  const r = await startPairing({
    codeChallenge: body.codeChallenge, deviceName: body.deviceName,
    platform: body.platform, appVersion: body.appVersion, ip: clientIp(req.headers),
  });
  if (r.kind === "rate_limited") return rateLimited(r.retryAfterSec);
  if (r.kind === "bad_request") return json({ error: "Bad request" }, 400);
  return json({ pairingId: r.pairingId, expiresAt: r.expiresAt.toISOString(), expiresInSec: PAIRING.requestTtlSec });
}
