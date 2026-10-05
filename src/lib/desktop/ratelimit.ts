import { prisma } from "@/lib/db";

/**
 * DB-backed fixed-window counters. The web app is serverless, so in-memory
 * limits would reset on every cold start and differ per instance.
 *
 * Keys are namespaced by axis ("ip:", "acct:", "pair:" ...). Each axis is
 * checked and incremented independently so that an attacker rotating one
 * (e.g. IPs) is still stopped by another (the account or the pairing).
 */
export type Limit = { limit: number; windowSec: number };
export type LimitState = { allowed: boolean; retryAfterSec: number };

/** Count this event and report whether it is still within the limit. */
export async function hit(key: string, cfg: Limit): Promise<LimitState> {
  const rows = await prisma.$queryRaw<{ count: number; ttl: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${cfg.windowSec}))
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN now() + make_interval(secs => ${cfg.windowSec}) ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count", CEIL(EXTRACT(EPOCH FROM ("resetAt" - now())))::int AS ttl`;
  const { count, ttl } = rows[0];
  return { allowed: count <= cfg.limit, retryAfterSec: Math.max(1, ttl) };
}

/** Read-only: is this key already over its limit? (Used before doing work, with failures counted via hit().) */
export async function isBlocked(key: string, cfg: Limit): Promise<LimitState> {
  const rows = await prisma.$queryRaw<{ count: number; ttl: number }[]>`
    SELECT "count", CEIL(EXTRACT(EPOCH FROM ("resetAt" - now())))::int AS ttl
    FROM "RateLimitBucket" WHERE "key" = ${key} AND "resetAt" > now()`;
  if (rows.length === 0) return { allowed: true, retryAfterSec: 0 };
  return { allowed: rows[0].count < cfg.limit, retryAfterSec: Math.max(1, rows[0].ttl) };
}

/** Opportunistic cleanup so the table can't grow without bound. */
export async function sweepExpired(): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "resetAt" < now() - interval '1 hour'`;
}

export function clientIp(headers: Headers): string {
  // Behind Vercel/most proxies the first X-Forwarded-For hop is the client.
  // If you self-host, make sure your proxy overwrites (not appends to) this header.
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}
