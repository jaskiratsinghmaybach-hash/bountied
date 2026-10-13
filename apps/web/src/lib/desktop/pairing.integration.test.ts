import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl, resetTestDatabase } from "@/test/db";
import { formatCode, newPairingCode, normalizeCode, pkceChallenge } from "./crypto";
import { LIMITS, PAIRING } from "./config";

/**
 * Bountied Desktop device pairing, against a real Postgres. Each test below is
 * one of the security properties promised in docs/desktop-pairing.md.
 * (The "desktop-pairing-e2e.ts" script that doc mentions isn't in the repo,
 * so these are the regression tests for it.) Runs only when TEST_DATABASE_URL
 * points at a throwaway database (see src/test/db.ts).
 */

describe("pairing code format (no database)", () => {
  it("is 16 symbols from the 32-symbol alphabet with no look-alike characters", () => {
    for (let i = 0; i < 200; i++) {
      const code = newPairingCode();
      expect(code).toHaveLength(PAIRING.codeLength);
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/); // no I, L, O or U
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, () => newPairingCode()));
    expect(seen.size).toBe(500);
  });

  it("uses every symbol in roughly equal measure (no modulo bias)", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) for (const ch of newPairingCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    expect(counts.size).toBe(32);
    const expected = (2000 * PAIRING.codeLength) / 32; // 1000 each
    for (const n of counts.values()) expect(Math.abs(n - expected)).toBeLessThan(expected * 0.2);
  });

  it("accepts a code typed with dashes, spaces, lower case and look-alikes", () => {
    const code = newPairingCode();
    expect(normalizeCode(formatCode(code).toLowerCase())).toBe(code);
    expect(normalizeCode(` ${formatCode(code)} `)).toBe(code);
    expect(normalizeCode("0123-4567-89AB-CDEF".replace(/0/g, "O"))).toBe("0123456789ABCDEF");
    expect(normalizeCode("1111-1111-1111-1111".replace(/1/g, "l"))).toBe("1111111111111111");
  });

  it("rejects anything that isn't a well-formed code", () => {
    for (const bad of [undefined, null, 5, "", "ABC", "U".repeat(16), "!".repeat(16), "A".repeat(17), "A".repeat(100)]) {
      expect(normalizeCode(bad), String(bad)).toBeNull();
    }
  });
});

const url = getTestDatabaseUrl();

describe.skipIf(!url)("desktop device pairing (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let p: typeof import("./pairing");
  let auth: typeof import("./auth");
  let crypto: typeof import("./crypto");

  beforeAll(async () => {
    process.env.DESKTOP_AUTH_SECRET = "test-secret-".padEnd(48, "x");
    process.env.DATABASE_URL = url as string;
    await resetTestDatabase(url as string);
    prisma = (await import("@/lib/db")).prisma;
    p = await import("./pairing");
    auth = await import("./auth");
    crypto = await import("./crypto");
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let seq = 0;
  let ipSeq = 0;
  // Every call gets a fresh address, so the (database-backed) rate limits used by one test never touch another.
  // A test that needs the SAME address for several calls takes one and reuses it.
  const ip = () => {
    ipSeq += 1;
    return `10.${Math.floor(ipSeq / 250)}.${ipSeq % 250}.7`;
  };
  async function mkUser() {
    seq += 1;
    return prisma.user.create({ data: { id: `u${seq}`, email: `u${seq}@test.dev`, name: `User ${seq}` } });
  }

  /** The desktop app's side: a fresh PKCE verifier and the request it starts. */
  async function startRequest(address = ip()) {
    const verifier = randomBytes(32).toString("base64url");
    const started = await p.startPairing({
      codeChallenge: pkceChallenge(verifier), deviceName: "Test laptop", platform: "windows", appVersion: "1.0.0", ip: address,
    });
    if (started.kind !== "ok") throw new Error(`start failed: ${started.kind}`);
    return { pairingId: started.pairingId, verifier, address };
  }

  /** Start, authorize as `userId`, and return what the app would then redeem. */
  async function authorized(userId: string) {
    const req = await startRequest();
    const authz = await p.authorizePairing(req.pairingId, userId, req.address);
    if (authz.kind !== "ok") throw new Error(`authorize failed: ${authz.kind}`);
    return { ...req, code: authz.code };
  }

  async function paired() {
    const user = await mkUser();
    const a = await authorized(user.id);
    const ex = await p.exchangeCode({ pairingId: a.pairingId, code: a.code, codeVerifier: a.verifier, ip: a.address });
    if (ex.kind !== "ok") throw new Error(`exchange failed: ${ex.kind}`);
    return { user, ...ex.tokens, address: a.address };
  }

  const bearer = (token: string) => new Request("http://localhost/api/desktop/x", { headers: { authorization: `Bearer ${token}` } });
  const whoIs = async (token: string) => (await auth.getDesktopAuth(bearer(token)))?.user.id ?? null;

  describe("pairing a device", () => {
    it("pairs a device end to end and the access token identifies the user", async () => {
      const t = await paired();
      expect(t.accessToken).toHaveLength(43);
      expect(t.expiresIn).toBe(15 * 60);
      expect(t.user.id).toBe(t.user.id);
      expect(await whoIs(t.accessToken)).toBe(t.user.id);
    });

    it("never stores the code or the tokens, only keyed hashes", async () => {
      const user = await mkUser();
      const a = await authorized(user.id);
      const row = await prisma.devicePairing.findUniqueOrThrow({ where: { id: a.pairingId } });
      expect(row.codeHash).not.toBeNull();
      expect(row.codeHash).not.toContain(a.code);
      expect(row.codeHash).toBe(crypto.hmac("code", a.code));

      const ex = await p.exchangeCode({ pairingId: a.pairingId, code: a.code, codeVerifier: a.verifier, ip: a.address });
      if (ex.kind !== "ok") throw new Error("exchange failed");
      const session = await prisma.deviceSession.findUniqueOrThrow({ where: { id: ex.tokens.sessionId } });
      expect(session.accessTokenHash).not.toBe(ex.tokens.accessToken);
      expect(session.refreshTokenHash).not.toBe(ex.tokens.refreshToken);
      expect(session.accessTokenHash).toBe(crypto.hmac("access", ex.tokens.accessToken));
      expect(JSON.stringify(session)).not.toContain(ex.tokens.refreshToken);
    });

    it("accepts the code as a person would type it", async () => {
      const user = await mkUser();
      const a = await authorized(user.id);
      const typed = crypto.formatCode(a.code).toLowerCase();
      const ex = await p.exchangeCode({ pairingId: a.pairingId, code: typed, codeVerifier: a.verifier, ip: a.address });
      expect(ex.kind).toBe("ok");
    });

    it("refuses a malformed challenge before creating anything", async () => {
      const before = await prisma.devicePairing.count();
      for (const bad of [undefined, "short", "!".repeat(43), 5]) {
        expect((await p.startPairing({ codeChallenge: bad, deviceName: "x", platform: "x", appVersion: "x", ip: ip() })).kind).toBe("bad_request");
      }
      expect(await prisma.devicePairing.count()).toBe(before);
    });

    it("cleans up the device's self-reported text", async () => {
      const verifier = randomBytes(32).toString("base64url");
      const r = await p.startPairing({
        codeChallenge: pkceChallenge(verifier), deviceName: "Evil\u0000\u001f name".padEnd(200, "x"), platform: "  ", appVersion: 7, ip: ip(),
      });
      if (r.kind !== "ok") throw new Error("start failed");
      const row = await prisma.devicePairing.findUniqueOrThrow({ where: { id: r.pairingId } });
      expect(row.deviceName.length).toBeLessThanOrEqual(60);
      expect(row.deviceName).not.toMatch(/[\u0000-\u001f]/);
      expect(row.platform).toBe("unknown");
      expect(row.appVersion).toBe("unknown");
    });
  });

  describe("the one-time code", () => {
    it("is single use: six simultaneous redemptions make one session", async () => {
      const user = await mkUser();
      const a = await authorized(user.id);
      const results = await Promise.all(
        Array.from({ length: 6 }, () => p.exchangeCode({ pairingId: a.pairingId, code: a.code, codeVerifier: a.verifier, ip: a.address }))
      );
      expect(results.filter((r) => r.kind === "ok")).toHaveLength(1);
      expect(await prisma.deviceSession.count({ where: { userId: user.id } })).toBe(1);
    });

    it("cannot be used a second time later either", async () => {
      const user = await mkUser();
      const a = await authorized(user.id);
      expect((await p.exchangeCode({ pairingId: a.pairingId, code: a.code, codeVerifier: a.verifier, ip: a.address })).kind).toBe("ok");
      expect((await p.exchangeCode({ pairingId: a.pairingId, code: a.code, codeVerifier: a.verifier, ip: a.address })).kind).toBe("invalid");
    });

    it("is useless without the PKCE verifier that never leaves the originating app", async () => {
      const user = await mkUser();
      const a = await authorized(user.id);
      const attacker = randomBytes(32).toString("base64url");
      const stolen = await p.exchangeCode({ pairingId: a.pairingId, code: a.code, codeVerifier: attacker, ip: a.address });
      expect(stolen.kind).toBe("invalid");
      expect(await prisma.deviceSession.count({ where: { userId: user.id } })).toBe(0);
      // The real app, which does know the verifier, can still finish.
      expect((await p.exchangeCode({ pairingId: a.pairingId, code: a.code, codeVerifier: a.verifier, ip: a.address })).kind).toBe("ok");
    });

    it("must be the code issued for THIS request", async () => {
      const user = await mkUser();
      const one = await authorized(user.id);
      const two = await authorized(user.id);
      const crossed = await p.exchangeCode({ pairingId: one.pairingId, code: two.code, codeVerifier: one.verifier, ip: one.address });
      expect(crossed.kind).toBe("invalid");
    });

    it("expires: an old code is refused", async () => {
      const user = await mkUser();
      const a = await authorized(user.id);
      await prisma.devicePairing.update({ where: { id: a.pairingId }, data: { codeExpiresAt: new Date(Date.now() - 1000) } });
      expect((await p.exchangeCode({ pairingId: a.pairingId, code: a.code, codeVerifier: a.verifier, ip: a.address })).kind).toBe("invalid");
    });

    it("expires with its request: an old request is refused even with a fresh code", async () => {
      const user = await mkUser();
      const a = await authorized(user.id);
      await prisma.devicePairing.update({ where: { id: a.pairingId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await p.exchangeCode({ pairingId: a.pairingId, code: a.code, codeVerifier: a.verifier, ip: a.address })).kind).toBe("invalid");
    });

    it("lives at most 3 minutes and never past its request", async () => {
      const user = await mkUser();
      const req = await startRequest();
      const authz = await p.authorizePairing(req.pairingId, user.id, req.address);
      if (authz.kind !== "ok") throw new Error("authorize failed");
      const row = await prisma.devicePairing.findUniqueOrThrow({ where: { id: req.pairingId } });
      const ttl = authz.codeExpiresAt.getTime() - Date.now();
      expect(ttl).toBeLessThanOrEqual(PAIRING.codeTtlSec * 1000 + 1000);
      expect(authz.codeExpiresAt.getTime()).toBeLessThanOrEqual(row.expiresAt.getTime());
    });

    it("is generated only when the user authorizes, not when the request starts", async () => {
      const req = await startRequest();
      const row = await prisma.devicePairing.findUniqueOrThrow({ where: { id: req.pairingId } });
      expect(row.codeHash).toBeNull();
      expect(row.userId).toBeNull();
    });
  });

  describe("authorizing in the browser", () => {
    it("can be done once, by one user", async () => {
      const owner = await mkUser();
      const other = await mkUser();
      const req = await startRequest();
      expect((await p.authorizePairing(req.pairingId, owner.id, req.address)).kind).toBe("ok");
      expect((await p.authorizePairing(req.pairingId, owner.id, req.address)).kind).toBe("invalid");
      expect((await p.authorizePairing(req.pairingId, other.id, req.address)).kind).toBe("invalid");
    });

    it("two users racing to claim one request: exactly one wins", async () => {
      const a = await mkUser();
      const b = await mkUser();
      const req = await startRequest();
      const [x, y] = await Promise.all([
        p.authorizePairing(req.pairingId, a.id, ip()),
        p.authorizePairing(req.pairingId, b.id, ip()),
      ]);
      expect([x.kind, y.kind].sort()).toEqual(["invalid", "ok"]);
    });

    it("hides a request someone else already claimed, exactly like one that doesn't exist", async () => {
      const owner = await mkUser();
      const other = await mkUser();
      const req = await startRequest();
      await p.authorizePairing(req.pairingId, owner.id, req.address);
      expect(await p.getPairingForReview(req.pairingId, other.id)).toBeNull();
      expect(await p.getPairingForReview("not-a-real-id", other.id)).toBeNull();
      expect(await p.getPairingForReview(req.pairingId, owner.id)).not.toBeNull();
    });

    it("never shows the challenge or the code hash on the review page", async () => {
      const user = await mkUser();
      const a = await authorized(user.id);
      const view = await p.getPairingForReview(a.pairingId, user.id);
      expect(Object.keys(view ?? {})).not.toContain("codeChallenge");
      expect(Object.keys(view ?? {})).not.toContain("codeHash");
    });

    it("can be denied, after which nothing can be authorized or redeemed", async () => {
      const user = await mkUser();
      const req = await startRequest();
      await p.denyPairing(req.pairingId, user.id);
      expect((await p.authorizePairing(req.pairingId, user.id, req.address)).kind).toBe("invalid");

      const b = await authorized(user.id);
      await p.denyPairing(b.pairingId, user.id);
      expect((await p.exchangeCode({ pairingId: b.pairingId, code: b.code, codeVerifier: b.verifier, ip: b.address })).kind).toBe("invalid");
    });

    it("cannot deny a request that another user claimed", async () => {
      const owner = await mkUser();
      const other = await mkUser();
      const a = await authorized(owner.id);
      await p.denyPairing(a.pairingId, other.id);
      expect((await p.exchangeCode({ pairingId: a.pairingId, code: a.code, codeVerifier: a.verifier, ip: a.address })).kind).toBe("ok");
    });
  });

  describe("guessing the code", () => {
    it("burns the request after too many wrong guesses, even if the right code comes next", async () => {
      const user = await mkUser();
      const a = await authorized(user.id);
      let wrong = newPairingCode();
      if (wrong === a.code) wrong = newPairingCode();
      for (let i = 0; i < PAIRING.maxFailedPerPairing; i++) {
        expect((await p.exchangeCode({ pairingId: a.pairingId, code: wrong, codeVerifier: a.verifier, ip: ip() })).kind).toBe("invalid");
      }
      const right = await p.exchangeCode({ pairingId: a.pairingId, code: a.code, codeVerifier: a.verifier, ip: ip() });
      expect(right.kind).toBe("invalid");
      expect(await prisma.deviceSession.count({ where: { userId: user.id } })).toBe(0);
    });

    it("blocks an address after too many failures against anyone", async () => {
      const address = ip();
      let sawLimit = false;
      for (let i = 0; i < LIMITS.failedExchangePerIp.limit + 5; i++) {
        const r = await p.exchangeCode({ pairingId: randomBytes(16).toString("base64url"), code: newPairingCode(), codeVerifier: randomBytes(32).toString("base64url"), ip: address });
        if (r.kind === "rate_limited") sawLimit = true;
      }
      expect(sawLimit).toBe(true);
    });

    it("answers every kind of failure the same way, so nothing leaks about why", async () => {
      const user = await mkUser();
      const a = await authorized(user.id);
      const unknownPairing = await p.exchangeCode({ pairingId: randomBytes(16).toString("base64url"), code: a.code, codeVerifier: a.verifier, ip: ip() });
      const wrongCode = await p.exchangeCode({ pairingId: a.pairingId, code: newPairingCode(), codeVerifier: a.verifier, ip: ip() });
      const wrongVerifier = await p.exchangeCode({ pairingId: a.pairingId, code: a.code, codeVerifier: randomBytes(32).toString("base64url"), ip: ip() });
      const garbage = await p.exchangeCode({ pairingId: 42, code: {}, codeVerifier: null, ip: ip() });
      for (const r of [unknownPairing, wrongCode, wrongVerifier, garbage]) expect(r).toEqual({ kind: "invalid" });
    });

    it("limits how many requests one address can start", async () => {
      const address = ip();
      const kinds: string[] = [];
      for (let i = 0; i < LIMITS.startPerIp.limit + 2; i++) {
        const verifier = randomBytes(32).toString("base64url");
        kinds.push((await p.startPairing({ codeChallenge: pkceChallenge(verifier), deviceName: "d", platform: "p", appVersion: "v", ip: address })).kind);
      }
      expect(kinds.slice(0, LIMITS.startPerIp.limit).every((k) => k === "ok")).toBe(true);
      expect(kinds.slice(LIMITS.startPerIp.limit)).toEqual(["rate_limited", "rate_limited"]);
    });

    it("limits how often one user can authorize", async () => {
      const user = await mkUser();
      const kinds: string[] = [];
      for (let i = 0; i < LIMITS.authorizePerUser.limit + 2; i++) {
        const req = await startRequest();
        kinds.push((await p.authorizePairing(req.pairingId, user.id, ip())).kind);
      }
      expect(kinds.filter((k) => k === "rate_limited").length).toBe(2);
    });
  });

  describe("keeping a device signed in", () => {
    it("rotates both tokens on every refresh and retires the old ones", async () => {
      const t = await paired();
      const r = await p.refreshSession({ refreshToken: t.refreshToken, ip: t.address });
      if (r.kind !== "ok") throw new Error("refresh failed");
      expect(r.refreshToken).not.toBe(t.refreshToken);
      expect(r.accessToken).not.toBe(t.accessToken);
      expect(await whoIs(r.accessToken)).toBe(t.user.id);
      expect(await whoIs(t.accessToken)).toBeNull(); // the old access token died with the rotation
      expect((await p.refreshSession({ refreshToken: t.refreshToken, ip: t.address })).kind).toBe("invalid");
    });

    it("treats a replayed, already-rotated refresh token as theft and revokes the whole session", async () => {
      const t = await paired();
      const first = await p.refreshSession({ refreshToken: t.refreshToken, ip: t.address });
      if (first.kind !== "ok") throw new Error("refresh failed");

      // Someone presents the token that was already rotated away.
      expect((await p.refreshSession({ refreshToken: t.refreshToken, ip: t.address })).kind).toBe("invalid");

      // The legitimate device's current tokens are now dead too: it has to pair again.
      expect((await p.refreshSession({ refreshToken: first.refreshToken, ip: t.address })).kind).toBe("invalid");
      expect(await whoIs(first.accessToken)).toBeNull();
      const row = await prisma.deviceSession.findUniqueOrThrow({ where: { id: t.sessionId } });
      expect(row.revokedAt).not.toBeNull();
      expect(row.revokedReason).toBe("refresh_token_reuse");
    });

    it("lets only one of several simultaneous refreshes with the same token win", async () => {
      const t = await paired();
      const results = await Promise.all(Array.from({ length: 6 }, () => p.refreshSession({ refreshToken: t.refreshToken, ip: t.address })));
      expect(results.filter((r) => r.kind === "ok")).toHaveLength(1);
    });

    it("refuses garbage refresh tokens", async () => {
      const address = ip();
      for (const bad of [undefined, null, 5, "", "short", "x".repeat(200), randomBytes(32).toString("base64url")]) {
        expect((await p.refreshSession({ refreshToken: bad, ip: address })).kind).toBe("invalid");
      }
    });

    it("keeps only the most recent 100 rotated-away tokens", async () => {
      const t = await paired();
      let token = t.refreshToken;
      for (let i = 0; i < 103; i++) {
        const r = await p.refreshSession({ refreshToken: token, ip: t.address });
        if (r.kind !== "ok") throw new Error(`refresh ${i} failed`);
        token = r.refreshToken;
      }
      const row = await prisma.deviceSession.findUniqueOrThrow({ where: { id: t.sessionId } });
      expect(row.prevRefreshTokenHashes.length).toBe(100);
    }, 60_000);
  });

  describe("revoking and expiring", () => {
    it("revoking a device kills its access and refresh on the very next request", async () => {
      const t = await paired();
      expect(await whoIs(t.accessToken)).toBe(t.user.id);
      expect(await p.revokeSession(t.sessionId, t.user.id, "user_revoked")).toBe(true);
      expect(await whoIs(t.accessToken)).toBeNull();
      expect((await p.refreshSession({ refreshToken: t.refreshToken, ip: t.address })).kind).toBe("invalid");
    });

    it("only the owner can revoke, and only once", async () => {
      const t = await paired();
      const stranger = await mkUser();
      expect(await p.revokeSession(t.sessionId, stranger.id, "x")).toBe(false);
      expect(await whoIs(t.accessToken)).toBe(t.user.id);
      expect(await p.revokeSession(t.sessionId, t.user.id, "x")).toBe(true);
      expect(await p.revokeSession(t.sessionId, t.user.id, "x")).toBe(false);
    });

    it("an expired access token is refused", async () => {
      const t = await paired();
      await prisma.deviceSession.update({ where: { id: t.sessionId }, data: { accessExpiresAt: new Date(Date.now() - 1000) } });
      expect(await whoIs(t.accessToken)).toBeNull();
    });

    it("an expired refresh window is refused, and so is the 180-day hard limit", async () => {
      const a = await paired();
      await prisma.deviceSession.update({ where: { id: a.sessionId }, data: { refreshExpiresAt: new Date(Date.now() - 1000) } });
      expect((await p.refreshSession({ refreshToken: a.refreshToken, ip: a.address })).kind).toBe("invalid");

      const b = await paired();
      await prisma.deviceSession.update({ where: { id: b.sessionId }, data: { absoluteExpiresAt: new Date(Date.now() - 1000) } });
      expect((await p.refreshSession({ refreshToken: b.refreshToken, ip: b.address })).kind).toBe("invalid");
      expect(await whoIs(b.accessToken)).toBeNull();
    });

    it("renewal never extends a session past its hard limit", async () => {
      const t = await paired();
      const absolute = new Date(Date.now() + 24 * 3600 * 1000);
      await prisma.deviceSession.update({ where: { id: t.sessionId }, data: { absoluteExpiresAt: absolute } });
      const r = await p.refreshSession({ refreshToken: t.refreshToken, ip: t.address });
      expect(r.kind).toBe("ok");
      const row = await prisma.deviceSession.findUniqueOrThrow({ where: { id: t.sessionId } });
      expect(row.refreshExpiresAt.getTime()).toBeLessThanOrEqual(absolute.getTime());
    });
  });

  describe("bearer authentication on /api/desktop/*", () => {
    it("takes identity only from a valid device token", async () => {
      const t = await paired();
      for (const header of [undefined, "", "Bearer", "Bearer short", `Basic ${t.accessToken}`, `Bearer ${"x".repeat(50)}`]) {
        const req = new Request("http://localhost/api/desktop/x", { headers: header === undefined ? {} : { authorization: header } });
        expect(await auth.getDesktopAuth(req), String(header)).toBeNull();
      }
      expect(await whoIs(t.accessToken)).toBe(t.user.id);
    });

    it("rejects a refresh token presented as an access token", async () => {
      const t = await paired();
      expect(await whoIs(t.refreshToken)).toBeNull();
    });
  });
});
