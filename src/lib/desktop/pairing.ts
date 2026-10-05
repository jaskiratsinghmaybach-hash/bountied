import { prisma } from "@/lib/db";
import { LIMITS, PAIRING, SESSION } from "./config";
import {
  hmac, isPairingId, isPkceChallenge, isPkceVerifier, newPairingCode, newPairingId, newToken,
  normalizeCode, pkceChallenge, safeEqual,
} from "./crypto";
import { hit, isBlocked, sweepExpired } from "./ratelimit";

const sec = (n: number) => n * 1000;
const clip = (v: unknown, max: number, fallback: string) =>
  typeof v === "string" && v.trim() ? v.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : fallback;

export type RateLimited = { kind: "rate_limited"; retryAfterSec: number };

// ── 1. Desktop starts a request ──────────────────────────────────────────────

export async function startPairing(input: {
  codeChallenge: unknown; deviceName: unknown; platform: unknown; appVersion: unknown; ip: string;
}): Promise<{ kind: "ok"; pairingId: string; expiresAt: Date } | { kind: "bad_request" } | RateLimited> {
  if (!isPkceChallenge(input.codeChallenge)) return { kind: "bad_request" };

  const limited = await hit(`start:ip:${input.ip}`, LIMITS.startPerIp);
  if (!limited.allowed) return { kind: "rate_limited", retryAfterSec: limited.retryAfterSec };

  const pairingId = newPairingId();
  const expiresAt = new Date(Date.now() + sec(PAIRING.requestTtlSec));
  await prisma.devicePairing.create({
    data: {
      id: pairingId,
      codeChallenge: input.codeChallenge,
      deviceName: clip(input.deviceName, 60, "Unknown device"),
      platform: clip(input.platform, 20, "unknown"),
      appVersion: clip(input.appVersion, 20, "unknown"),
      startIp: input.ip === "unknown" ? null : input.ip,
      expiresAt,
    },
  });

  // Housekeeping (best effort, never blocks the caller).
  void prisma.devicePairing
    .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - sec(24 * 3600)) } } })
    .then(sweepExpired)
    .catch(() => {});

  return { kind: "ok", pairingId, expiresAt };
}

// ── 2. Signed-in user authorizes in the browser ──────────────────────────────

/** What the authorize page may show. Never includes the challenge or code hash. */
export async function getPairingForReview(pairingId: string, userId: string) {
  if (!isPairingId(pairingId)) return null;
  const p = await prisma.devicePairing.findUnique({
    where: { id: pairingId },
    select: {
      id: true, deviceName: true, platform: true, appVersion: true, startIp: true,
      createdAt: true, expiresAt: true, userId: true, consumedAt: true, authorizedAt: true,
    },
  });
  if (!p) return null;
  // A request already claimed by someone else must look identical to "not found".
  if (p.userId && p.userId !== userId) return null;
  return p;
}

export type AuthorizeResult =
  | { kind: "ok"; code: string; codeExpiresAt: Date }
  | { kind: "invalid" }
  | RateLimited;

export async function authorizePairing(pairingId: string, userId: string, ip: string): Promise<AuthorizeResult> {
  if (!isPairingId(pairingId)) return { kind: "invalid" };

  for (const [k, cfg] of [
    [`authz:user:${userId}`, LIMITS.authorizePerUser],
    [`authz:ip:${ip}`, LIMITS.authorizePerIp],
  ] as const) {
    const r = await hit(k, cfg);
    if (!r.allowed) return { kind: "rate_limited", retryAfterSec: r.retryAfterSec };
  }

  const now = new Date();
  const code = newPairingCode();
  const requestRow = await prisma.devicePairing.findUnique({ where: { id: pairingId }, select: { expiresAt: true } });
  if (!requestRow) return { kind: "invalid" };

  const codeExpiresAt = new Date(Math.min(now.getTime() + sec(PAIRING.codeTtlSec), requestRow.expiresAt.getTime()));

  // Atomic claim: only an unclaimed, unexpired, unconsumed request can be authorized, once.
  const claimed = await prisma.devicePairing.updateMany({
    where: { id: pairingId, userId: null, consumedAt: null, expiresAt: { gt: now } },
    data: { userId, codeHash: hmac("code", code), authorizedAt: now, codeExpiresAt },
  });
  if (claimed.count !== 1) return { kind: "invalid" };
  return { kind: "ok", code, codeExpiresAt };
}

export async function denyPairing(pairingId: string, userId: string): Promise<void> {
  if (!isPairingId(pairingId)) return;
  await prisma.devicePairing.updateMany({
    where: { id: pairingId, consumedAt: null, OR: [{ userId: null }, { userId }] },
    data: { expiresAt: new Date(0), codeHash: null },
  });
}

// ── 3. Desktop redeems the code ──────────────────────────────────────────────

export type SessionTokens = {
  accessToken: string; refreshToken: string; expiresIn: number; sessionId: string;
  user: { id: string; name: string; email: string };
};

export type ExchangeResult =
  | { kind: "ok"; tokens: SessionTokens }
  | { kind: "invalid" } // deliberately one answer for every failure reason
  | RateLimited;

function issueTokens() {
  const accessToken = newToken();
  const refreshToken = newToken();
  return { accessToken, refreshToken, accessHash: hmac("access", accessToken), refreshHash: hmac("refresh", refreshToken) };
}

export async function exchangeCode(input: {
  pairingId: unknown; code: unknown; codeVerifier: unknown; ip: string;
}): Promise<ExchangeResult> {
  const ipKey = `xchg:ip:${input.ip}`;

  // Cheap gates first: total attempts and recorded failures per IP.
  const all = await hit(`xchg-all:ip:${input.ip}`, LIMITS.exchangeAttemptsPerIp);
  if (!all.allowed) return { kind: "rate_limited", retryAfterSec: all.retryAfterSec };
  const ipBlocked = await isBlocked(ipKey, LIMITS.failedExchangePerIp);
  if (!ipBlocked.allowed) return { kind: "rate_limited", retryAfterSec: ipBlocked.retryAfterSec };

  const pairingId = isPairingId(input.pairingId) ? input.pairingId : null;
  const pairing = pairingId
    ? await prisma.devicePairing.findUnique({ where: { id: pairingId } })
    : null;

  // Per-account axis: attacker rotating IPs against one victim's requests still hits this.
  const acctKey = pairing?.userId ? `xchg:acct:${pairing.userId}` : null;
  if (acctKey) {
    const b = await isBlocked(acctKey, LIMITS.failedExchangePerAccount);
    if (!b.allowed) return { kind: "rate_limited", retryAfterSec: b.retryAfterSec };
  }

  const fail = async (): Promise<ExchangeResult> => {
    await hit(ipKey, LIMITS.failedExchangePerIp);
    if (acctKey) await hit(acctKey, LIMITS.failedExchangePerAccount);
    if (pairing) {
      // Per-pairing axis: burn the request after too many wrong guesses.
      const updated = await prisma.devicePairing.update({
        where: { id: pairing.id }, data: { failedAttempts: { increment: 1 } }, select: { failedAttempts: true },
      });
      if (updated.failedAttempts >= PAIRING.maxFailedPerPairing) {
        await prisma.devicePairing.updateMany({
          where: { id: pairing.id, consumedAt: null },
          data: { expiresAt: new Date(0), codeHash: null },
        });
      }
    }
    return { kind: "invalid" };
  };

  const code = normalizeCode(input.code);
  const now = new Date();
  if (
    !pairing || !code || !isPkceVerifier(input.codeVerifier) ||
    !pairing.userId || !pairing.codeHash || !pairing.codeExpiresAt || pairing.consumedAt ||
    pairing.expiresAt <= now || pairing.codeExpiresAt <= now ||
    pairing.failedAttempts >= PAIRING.maxFailedPerPairing
  ) return fail();

  // Both must hold: the code is the one issued for this request, and the caller
  // is the app instance that started it (it knows the PKCE verifier).
  const codeOk = safeEqual(hmac("code", code), pairing.codeHash);
  const verifierOk = safeEqual(pkceChallenge(input.codeVerifier), pairing.codeChallenge);
  if (!codeOk || !verifierOk) return fail();

  const t = issueTokens();
  const user = await prisma.user.findUnique({ where: { id: pairing.userId }, select: { id: true, name: true, email: true } });
  if (!user) return fail();

  try {
    const sessionId = await prisma.$transaction(async (tx) => {
      // Single use, enforced by the database: exactly one caller can flip consumedAt.
      const consumed = await tx.devicePairing.updateMany({
        where: { id: pairing.id, consumedAt: null, codeHash: pairing.codeHash, expiresAt: { gt: now }, codeExpiresAt: { gt: now } },
        data: { consumedAt: now, codeHash: null },
      });
      if (consumed.count !== 1) throw new Error("already_consumed");
      const s = await tx.deviceSession.create({
        data: {
          userId: user.id, deviceName: pairing.deviceName, platform: pairing.platform, appVersion: pairing.appVersion,
          lastIp: input.ip === "unknown" ? null : input.ip,
          accessTokenHash: t.accessHash, accessExpiresAt: new Date(Date.now() + sec(SESSION.accessTtlSec)),
          refreshTokenHash: t.refreshHash, refreshExpiresAt: new Date(Date.now() + sec(SESSION.refreshTtlSec)),
          absoluteExpiresAt: new Date(Date.now() + sec(SESSION.absoluteTtlSec)),
        },
        select: { id: true },
      });
      return s.id;
    });
    return {
      kind: "ok",
      tokens: { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: SESSION.accessTtlSec, sessionId, user },
    };
  } catch {
    return { kind: "invalid" };
  }
}

// ── 4. Renewal (rotating refresh tokens with reuse detection) ────────────────

export type RefreshResult =
  | { kind: "ok"; accessToken: string; refreshToken: string; expiresIn: number }
  | { kind: "invalid" } // revoked, expired, unknown, or reuse detected -> app must re-pair
  | RateLimited;

export async function refreshSession(input: { refreshToken: unknown; ip: string }): Promise<RefreshResult> {
  const lim = await hit(`refresh:ip:${input.ip}`, LIMITS.refreshPerIp);
  if (!lim.allowed) return { kind: "rate_limited", retryAfterSec: lim.retryAfterSec };

  const presented = input.refreshToken;
  if (typeof presented !== "string" || presented.length < 32 || presented.length > 128) return { kind: "invalid" };
  const presentedHash = hmac("refresh", presented);
  const now = new Date();

  const current = await prisma.deviceSession.findUnique({ where: { refreshTokenHash: presentedHash } });
  if (!current) {
    // A token we already rotated away from being replayed = likely theft. Kill the session.
    const reused = await prisma.deviceSession.findFirst({ where: { prevRefreshTokenHashes: { has: presentedHash } } });
    if (reused && !reused.revokedAt) {
      await prisma.deviceSession.update({
        where: { id: reused.id }, data: { revokedAt: now, revokedReason: "refresh_token_reuse" },
      });
    }
    return { kind: "invalid" };
  }
  if (current.revokedAt || current.refreshExpiresAt <= now || current.absoluteExpiresAt <= now) return { kind: "invalid" };

  const t = issueTokens();
  const newAccessExp = new Date(now.getTime() + sec(SESSION.accessTtlSec));
  const newRefreshExp = new Date(Math.min(now.getTime() + sec(SESSION.refreshTtlSec), current.absoluteExpiresAt.getTime()));
  const newIp = input.ip === "unknown" ? current.lastIp : input.ip;
  // Raw SQL so the compare-and-swap AND the bounded history append happen in ONE atomic
  // statement: two concurrent refreshes with the same token can't both win, and the
  // history keeps only the most recent 100 rotated-away hashes.
  const rotatedCount = await prisma.$executeRaw`
    UPDATE "DeviceSession" SET
      "accessTokenHash" = ${t.accessHash}, "accessExpiresAt" = ${newAccessExp},
      "refreshTokenHash" = ${t.refreshHash}, "refreshExpiresAt" = ${newRefreshExp},
      "prevRefreshTokenHashes" = (array_append(COALESCE("prevRefreshTokenHashes", ARRAY[]::TEXT[]), ${presentedHash}))
        [GREATEST(1, COALESCE(cardinality("prevRefreshTokenHashes"), 0) + 2 - 100):],
      "lastSeenAt" = ${now}, "lastIp" = ${newIp}
    WHERE "id" = ${current.id} AND "refreshTokenHash" = ${presentedHash} AND "revokedAt" IS NULL`;
  const rotated = { count: rotatedCount };
  if (rotated.count !== 1) return { kind: "invalid" };
  return { kind: "ok", accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: SESSION.accessTtlSec };
}

// ── 5. Revocation ────────────────────────────────────────────────────────────

export async function revokeSession(sessionId: string, userId: string, reason: string): Promise<boolean> {
  const r = await prisma.deviceSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return r.count === 1;
}
