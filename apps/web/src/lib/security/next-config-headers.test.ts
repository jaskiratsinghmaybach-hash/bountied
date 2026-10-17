import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

/**
 * Regression coverage for a real gap: next.config.ts previously had no
 * headers() function at all, so the app sent no X-Frame-Options,
 * X-Content-Type-Options, Referrer-Policy, Permissions-Policy, or HSTS on
 * ANY response — removing a whole layer of defense-in-depth against
 * clickjacking, MIME-sniffing attacks, and referrer-leak issues.
 *
 * This test exercises next.config.ts's own headers() function directly (the
 * same function Next.js's dev/build server calls to build its header
 * table) rather than making a live HTTP request, since this environment has
 * no network access to actually boot `next dev`/`next start` and curl it.
 * It fails against the pre-fix config (no headers() export at all, so
 * `nextConfig.headers` is undefined and this throws) and passes against the
 * fix. It does not substitute for also checking real response headers with
 * `curl -I` against a running instance before this ships, since Next.js
 * applying a config correctly at runtime is Next.js's own behavior to
 * verify, not something a unit test against the config object can fully
 * guarantee.
 *
 * Lives under src/lib/security (rather than next to next.config.ts at the
 * package root) because vitest.config.ts's `include: ["src/**\/*.test.ts"]`
 * only discovers tests under src/ — a root-level next.config.test.ts would
 * silently never run.
 */
describe("next.config.ts: security headers", () => {
  it("declares a headers() function", () => {
    expect(typeof nextConfig.headers).toBe("function");
  });

  it("applies baseline security headers to every route", async () => {
    const rules = await nextConfig.headers!();
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);

    const catchAll = rules.find((r) => r.source === "/:path*");
    expect(catchAll).toBeDefined();

    const byKey = Object.fromEntries(
      (catchAll!.headers ?? []).map((h) => [h.key, h.value])
    );

    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Permissions-Policy"]).toBeDefined();
    expect(byKey["Permissions-Policy"]).toContain("camera=()");
    expect(byKey["Permissions-Policy"]).toContain("microphone=()");
    expect(byKey["Permissions-Policy"]).toContain("geolocation=()");
    expect(byKey["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    expect(byKey["Strict-Transport-Security"]).toContain("includeSubDomains");
  });
});
