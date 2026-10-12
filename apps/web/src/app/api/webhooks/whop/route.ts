import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { handleWhopEvent } from "@/lib/payments/whop-events";

/**
 * Whop signs webhooks using the Standard Webhooks spec (standardwebhooks.com),
 * NOT a bare HMAC-over-body-in-hex scheme. Three headers arrive together:
 *   webhook-id        - unique event id
 *   webhook-timestamp  - unix seconds
 *   webhook-signature  - space-separated list of "v1,<base64-hmac-sha256>"
 *
 * The signed content is "{id}.{timestamp}.{body}" (period-joined), HMAC-SHA256'd
 * with the base64-DECODED secret, then base64-encoded for comparison — not hex.
 * Getting any of these wrong means every real webhook gets silently rejected
 * with no error surfaced anywhere except a 401 in server logs.
 */
function verifyWhopSignature(params: {
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
}): boolean {
  const { rawBody, webhookId, webhookTimestamp, webhookSignature } = params;

  if (!webhookId || !webhookTimestamp || !webhookSignature) return false;
  if (!process.env.WHOP_WEBHOOK_SECRET) return false;

  // Reject stale events (>5 min old) to limit replay-attack window.
  const timestampSeconds = Number(webhookTimestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (ageSeconds > 300) return false;

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;

  // Whop's webhook secret is prefixed "whsec_" and base64-encoded after that.
  const secretRaw = process.env.WHOP_WEBHOOK_SECRET.startsWith("whsec_")
    ? process.env.WHOP_WEBHOOK_SECRET.slice("whsec_".length)
    : process.env.WHOP_WEBHOOK_SECRET;
  const secretBytes = Buffer.from(secretRaw, "base64");

  const expectedSignature = createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  // webhook-signature can contain multiple space-separated "v1,<sig>" entries —
  // any match is valid (used during secret rotation).
  const candidates = webhookSignature
    .split(" ")
    .map((entry) => entry.split(",")[1])
    .filter(Boolean);

  return candidates.some((candidate) => {
    try {
      const a = Buffer.from(candidate, "base64");
      const b = Buffer.from(expectedSignature, "base64");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const isValid = verifyWhopSignature({
    rawBody,
    webhookId: request.headers.get("webhook-id"),
    webhookTimestamp: request.headers.get("webhook-timestamp"),
    webhookSignature: request.headers.get("webhook-signature"),
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Crediting (idempotent, for Givers and Solvers alike) lives in lib/payments/whop-events.ts.
  const result = await handleWhopEvent(event);
  return NextResponse.json(result.body, { status: result.status });
}
