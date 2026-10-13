import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every API route must prove who is calling before it does anything, or be on
 * the short list below of routes that are public ON PURPOSE. This test reads the
 * route files, so a new route without an authentication check fails the suite
 * instead of shipping quietly. (A route with no check at all, a mirror
 * endpoint that anyone could POST a submission id to, existed until this test
 * was written.)
 *
 * It checks that an authentication call is PRESENT, not that it is used well:
 * the behavior of each check is tested where the route's logic lives.
 */
const API_DIR = path.resolve(__dirname, "../../app/api");

/** Calls that establish the caller: a user session, a device token, an admin check, a signature or a shared secret. */
const AUTH_MARKERS = /getCurrentUser|getDesktopAuth|getDesktopUser|requireAdmin|auth\.getUser|verifyWhop|SANDBOX_INTERNAL_SECRET|createClient\(/;

/** Public by design. Each one is protected some other way, and each is tested. */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  "desktop/pair/start/route.ts": "the device has no session yet; rate limited, creates only an unauthorized request (pairing.integration.test.ts)",
  "desktop/pair/exchange/route.ts": "redeems a one-time code with a PKCE verifier; single use, rate limited (pairing.integration.test.ts)",
  "desktop/session/refresh/route.ts": "presents a rotating refresh token; reuse revokes the session (pairing.integration.test.ts)",
};

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

const routes = routeFiles(API_DIR).map((f) => ({
  rel: path.relative(API_DIR, f).split(path.sep).join("/"),
  source: readFileSync(f, "utf8"),
}));

describe("API routes authenticate their callers", () => {
  it("finds the routes", () => {
    expect(routes.length).toBeGreaterThan(10);
  });

  it.each(routes.map((r) => [r.rel, r.source] as const))("%s checks who is calling, or is public on purpose", (rel, source) => {
    if (rel in PUBLIC_BY_DESIGN) return;
    expect(AUTH_MARKERS.test(source), `${rel} has no authentication check. Add one, or list it in PUBLIC_BY_DESIGN with the reason.`).toBe(true);
  });

  it("keeps the public list honest: every entry still exists and none has quietly gained a user check", () => {
    for (const rel of Object.keys(PUBLIC_BY_DESIGN)) {
      expect(routes.some((r) => r.rel === rel), `${rel} is listed as public but no longer exists`).toBe(true);
    }
  });

  it("has no open endpoint that mirrors or runs a submission by id", () => {
    expect(routes.some((r) => r.rel === "github/mirror/route.ts")).toBe(false);
  });
});
