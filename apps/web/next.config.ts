import type { NextConfig } from "next";

/**
 * Baseline security headers (security audit, section H: "Missing security
 * headers or unsafe Content Security Policy configuration"). Before this
 * change, next.config.ts had no headers() function at all, so the app sent
 * NONE of these on any response.
 *
 * These five are deliberately the low-risk, broadly-safe baseline:
 *   - X-Frame-Options: DENY — no page in this app uses an iframe (verified
 *     by search), so this is safe to set app-wide; blocks clickjacking.
 *   - X-Content-Type-Options: nosniff — stops the browser from
 *     MIME-sniffing a response into a different (possibly executable)
 *     content type than the server declared.
 *   - Referrer-Policy: strict-origin-when-cross-origin — avoids leaking
 *     full URLs (which can carry query-string tokens or ids) to third-party
 *     origins on outbound navigation/fetches, while still sending useful
 *     referrer info same-origin.
 *   - Permissions-Policy — explicitly denies browser features this app
 *     does not use, reducing the attack surface available to any injected
 *     script.
 *   - Strict-Transport-Security — only meaningful once the app is served
 *     over HTTPS in production (Vercel does this by default); harmless in
 *     local dev over http where browsers ignore it.
 *
 * NOT included here: Content-Security-Policy. A real CSP needs to
 * enumerate every origin this app legitimately loads from (Supabase, the
 * GitHub avatar/API domains used client-side if any, any analytics, font
 * origins, etc.) and ideally a nonce-based script-src — getting that list
 * wrong breaks the app rather than securing it, and that enumeration needs
 * to be done against the running app with real QA, not guessed from a
 * static read of the source in an environment with no network access to
 * actually load the app and see what fails. This is flagged as a
 * follow-up in the audit's findings register rather than shipped as a
 * guess here.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
