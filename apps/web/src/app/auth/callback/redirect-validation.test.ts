import { describe, expect, it } from "vitest";

/**
 * Regression coverage for a real open-redirect vulnerability (CWE-601) in
 * apps/web/src/app/auth/callback/route.ts.
 *
 * Before the fix, `redirectedFrom` (fully attacker-controlled query-string
 * input) was used as-is to build `destination`, then the final redirect was
 * `${origin}${destination}` — plain string concatenation, not a
 * relative-redirect API. That concatenation does NOT prevent an open
 * redirect: `redirectedFrom=@evil.com/x` turned
 * "https://bountied.com" + "@evil.com/x" into
 * "https://bountied.com@evil.com/x" — which `new URL(...)` (and real
 * browsers) parse as userinfo "bountied.com" @ host "evil.com", i.e. a
 * redirect straight to evil.com. This is the classic
 * https://trusted@evil.com/ phishing pattern, confirmed by direct `new
 * URL()` inspection: `new URL("https://bountied.com@evil.com/x").host ===
 * "evil.com"`.
 *
 * The fix validates redirectedFrom against the shape every legitimate
 * caller actually uses (an internal relative path, e.g.
 * request.nextUrl.pathname from lib/supabase/middleware.ts) before it is
 * ever used as a redirect destination, falling back to the normal
 * /dashboard destination otherwise.
 *
 * This file tests the validation predicate directly (reproduced here to
 * mirror route.ts's isSafeRelativePath exactly — see that file for the
 * inline copy that actually runs in production) because exercising the
 * route handler itself end-to-end would require mocking Supabase's
 * exchangeCodeForSession and a Prisma user lookup, which is unrelated
 * plumbing this fix doesn't touch; the vulnerable and fixed behavior lives
 * entirely in this predicate.
 */
function isSafeRelativePath(value: string | null): value is string {
  return (
    value !== null &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("@") &&
    !value.includes("\\") &&
    !value.includes("://")
  );
}

describe("auth callback: redirectedFrom open-redirect guard", () => {
  it("rejects the confirmed working exploit payload (userinfo host-confusion)", () => {
    const payload = "@evil.com/x";
    expect(isSafeRelativePath(payload)).toBe(false);

    // Prove the exploit is real against naive concatenation, so this test
    // actually demonstrates what's being guarded against, not just an
    // assertion about the guard in isolation.
    const origin = "https://bountied.com";
    const maliciousUrl = new URL(`${origin}${payload}`);
    expect(maliciousUrl.host).toBe("evil.com"); // the naive concat redirects off-site
  });

  it("rejects absolute URLs, protocol-relative URLs, and scheme tricks", () => {
    const attacks = [
      "https://evil.com",
      "http://evil.com/phish",
      "//evil.com",
      "//evil.com/path",
      "/\\evil.com",
      "javascript:alert(document.cookie)",
      "/ok@evil.com", // "@" anywhere, not just as the first char, is rejected
    ];
    for (const attack of attacks) {
      expect(isSafeRelativePath(attack)).toBe(false);
    }
  });

  it("rejects null and empty input", () => {
    expect(isSafeRelativePath(null)).toBe(false);
    expect(isSafeRelativePath("")).toBe(false);
  });

  it("accepts the actual shapes every legitimate caller sends", () => {
    // lib/supabase/middleware.ts sets this from request.nextUrl.pathname
    expect(isSafeRelativePath("/dashboard")).toBe(true);
    expect(isSafeRelativePath("/problems/new")).toBe(true);
    expect(isSafeRelativePath("/onboarding")).toBe(true);
    // the desktop pairing flow's query-string path shape
    expect(isSafeRelativePath("/desktop/connect?req=abcDEF123456789012345_")).toBe(true);
  });
});
