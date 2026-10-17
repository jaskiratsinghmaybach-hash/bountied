# Security audit report — 2026-10-17

## A. Executive summary

**Scope.** A source-level audit of the Bountied monorepo (escrow/bounty platform: Next.js 16 /
React 19 / Prisma 7 / PostgreSQL, a Tauri desktop app, a shared package) against the full A–K
checklist in the audit brief: escrow release, withdrawals, admin payout state transitions,
desktop API auth, submission evidence/reveal privacy, GitHub integration, sandbox execution,
general web app security, auth/roles/admin controls, DB/concurrency/financial invariants, and
dependencies/config/deployment.

**Overall status: the codebase is well above average for this class of application.** Nearly
every area audited already had the right defensive pattern in place, frequently with in-code
comments documenting a *previously real* vulnerability that a prior developer had already found
and fixed (GitHub repo-URL command injection in the clone path, a public-mirror-repo information
leak, a `"use server"` action that used to trust a client-supplied `giverId`, a desktop pairing
HMAC token design). The financial concurrency patterns — conditional `updateMany` as an atomic
claim inside a transaction, re-checked under Postgres's real Read-Committed semantics rather than
assumed — are correct everywhere I checked them: escrow release, withdrawal debits, admin
payout success/failure, and the review-charge claim.

**What was actually wrong, confirmed by direct testing/reasoning rather than inspection alone:**

1. **A real financial-correctness bug in fee rounding** (`apps/web/src/lib/payments/fees.ts`):
   independent floating-point rounding of a fee and its paired net amount meant the two didn't
   reliably sum back to the original amount — confirmed by an exhaustive scan of $0.01–$20,000.00
   that found 70,053 mismatched cent amounts for the release-fee pair alone (and the same count
   for the withdrawal-fee pair). **Fixed** with integer-cents arithmetic where the net amount is
   derived as `total − fee`, never independently rounded.
2. **A real, confirmed open redirect (CWE-601)** in the OAuth callback route
   (`apps/web/src/app/auth/callback/route.ts`): `redirectedFrom` was attacker-controlled and used
   in `${origin}${destination}` string concatenation, which does not prevent a redirect to an
   attacker's domain — `redirectedFrom=@evil.com/x` resolves to host `evil.com` under the URL
   spec's userinfo syntax, confirmed directly with `new URL(...)`. **Fixed** with a strict
   safe-relative-path allowlist, matching the stricter regex-based allowlist another part of the
   same codebase (`lib/auth/actions.ts`) already used for an equivalent case.
3. **No security response headers anywhere** (`apps/web/next.config.ts` had no `headers()`
   function at all): no `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
   `Permissions-Policy`, or HSTS on any response. **Fixed** with a conservative baseline (verified
   safe against this app — no iframes exist anywhere in it); a full `Content-Security-Policy` is
   explicitly **not** included and is flagged as a follow-up requiring live-app testing (see
   Remaining risks).
4. **The audit brief's own explicitly-required test was missing.** Section C calls the
   succeeded-vs-failed admin payout race "HIGH PRIORITY" and explicitly requires testing
   `markPayoutSucceeded` racing `markPayoutFailed` on the same payout. The existing test file
   only tested `markPayoutFailed` against itself. The underlying implementation was already
   correct (verified by reading `admin-actions.ts`'s conditional-update logic against real
   Postgres concurrency semantics); **the missing test has been added**, along with two more
   gap-filling tests (double-transition rejection, unknown payout id).
5. A small number of **Low-severity / informational** items that don't need urgent code changes:
   a stale code comment describing a DB constraint as "would be good to add" when it already
   exists (fixed); a documented plaintext-token migration compatibility path that should be
   tightened once 100% backfill is confirmed; a rate limiter that correctly documents but still
   depends on `X-Forwarded-For` being sanitized by the hosting proxy; client-supplied MIME-type
   trust on image upload with no magic-byte verification.

**What I could not do, and why (read before trusting the "test report" below).** This review was
done against a zip export of the repository with **no `.git` directory** and in a sandboxed
environment with **no outbound network access** — confirmed directly (`git clone` failed to
resolve `github.com`; `npm ping` timed out with no response). That means:

- I could not verify the `fb561a6` / `4acd974` commit-history checkpoints from section 3 of the
  brief — there is no git history in this export to check them against.
- I could not run `npm install`, so there is no `node_modules`, no generated Prisma client, and
  no way to actually execute `vitest`, `tsc`, `next build`, or the `test:db` embedded-Postgres
  harness.
- Every fix and every new/extended test below was verified as thoroughly as static analysis
  allows: logic re-implemented and run directly in plain Node outside the TypeScript/Prisma
  toolchain (for pure functions), syntax-checked with a standalone `tsc --noEmit` per file
  (catches real syntax errors; cannot catch type errors that depend on generated Prisma types or
  path aliases), and manually traced against every caller found via `grep`. **No test in this
  audit was actually executed by vitest, and no claim below should be read as "CI passed."**
  This matches a prior work session's own handoff note in this same repo
  (`docs/2026-10-14-hardening-handoff.md`), which hit the identical `npm ci` network limitation —
  this appears to be a recurring constraint of this review environment, not something specific to
  this session.

See section F (deliverable D, "Test report") for the precise, honest breakdown of what ran vs.
what was reasoned about vs. what is simply unknown.

---

## B. Findings register

Severity scale: **Critical** (direct path to fund theft/loss or full account takeover, no real
preconditions) · **High** (serious impact, some precondition) · **Medium** (real, demonstrable
impact, bounded or requiring user interaction) · **Low** (defense-in-depth gap or narrow,
low-impact issue) · **Info** (no security impact; correctness/maintainability).

### F-01 — Fee/net amount rounding does not always sum to the original amount

- **Severity:** Medium
- **File / function:** `apps/web/src/lib/payments/fees.ts` — `releaseFeeFor`,
  `amountCreditedOnRelease`, `withdrawalFeeFor`, `amountPaidOnWithdrawal` (pre-fix `money()`
  helper)
- **Vulnerability and impact:** The fee and the "other side" of the same transaction (e.g. a
  bounty's release fee and the solver's credited amount) were computed as two **independent**
  floating-point multiplications, each separately rounded with `Math.round(n * 100) / 100`. IEEE
  754 floats don't represent most cent values exactly (`1.005 * 100 === 100.49999999999999` in
  JS), so the two independent roundings can land on different sides of a cent boundary. This is
  not a rare edge case: a direct scan of every cent-valued amount from $0.01 to $20,000.00 found
  **70,053 mismatches** for the release pair (fee + credited ≠ original bounty amount) and the
  same count for the withdrawal pair (fee + payout ≠ requested amount) — about 3.5% of all
  possible amounts. Concretely, a $0.10 bounty release computed `releaseFeeFor(0.10) = 0.01` and
  `amountCreditedOnRelease(0.10) = 0.10`, summing to $0.11 — one cent created from nothing. This
  compounds across the platform's transaction volume over time and directly fails the audit
  brief's own acceptance criterion for decimal precision and currency-rounding consistency.
- **Reproduction / evidence:** `node -e` scripts run during this audit (see the session log);
  reproduced independently of any test framework by computing `1.005 * 100` directly in Node and
  by scanning the full cent range for both fee pairs.
- **Fix implemented:** Rewrote the module to do all rounding in integer cents (`toCents`/
  `fromCents` helpers), and — critically — to derive the "net" side of every fee pair as
  `totalCents - feeCents` rather than as an independent percentage multiply, so the two always
  sum to the original amount by construction, not by chance. No exported function signature
  changed, so no caller needed updating.
- **Regression test:** `apps/web/src/lib/payments/fees.test.ts` (new). Asserts fee+net sums to
  the original for the ten specific boundary values confirmed broken pre-fix, then re-runs the
  full $0.01–$2,000.00 exhaustive scan as an actual test assertion (`expect(mismatches).toBe(0)`),
  for both the release pair and the withdrawal pair, plus a funding-fee consistency check.
- **Validation result:** Logic re-implemented standalone in plain Node and run against the same
  scan ranges used to find the bug — confirmed 0 mismatches post-fix across $0.01–$20,000.00 (the
  test file itself scans $0.01–$2,000.00 to keep the suite fast; the wider range was checked
  manually during this audit). Not executed via vitest (no toolchain available — see Executive
  summary).
- **Remaining risk:** None identified in the fixed logic itself. The fix does not change
  behavior for any already-correct amount, only corrects the previously-mismatched ~3.5%.
  Historical `CreditTransaction` / `PayoutRequest` rows created before this fix may already
  contain off-by-a-cent amounts; reconciling those (if desired) is a data migration, out of scope
  for a code fix and not attempted here.

### F-02 — Open redirect via `redirectedFrom` in the OAuth callback

- **Severity:** Medium
- **File / function:** `apps/web/src/app/auth/callback/route.ts` — `GET`
- **Vulnerability and impact:** The handler built its post-login redirect as
  `` `${origin}${destination}` ``, where `destination` could be `explicitRedirect`, taken directly
  from the `redirectedFrom` query parameter with no validation. Prepending the trusted `origin`
  string does **not** prevent an open redirect: a value of `@evil.com/x` turns
  `"https://bountied.com" + "@evil.com/x"` into `"https://bountied.com@evil.com/x"`, which the
  URL spec (and real browsers) parse as **userinfo** `bountied.com` **at host** `evil.com` — i.e.
  a redirect straight to the attacker's domain, under a URL that begins with the legitimate
  origin string (the classic `https://trusted@evil.com/` phishing pattern). This is exploitable
  as a post-login redirect to an attacker-controlled page for phishing, malware delivery, or
  session/credential-harvesting purposes, wherever an attacker can get a `redirectedFrom`-bearing
  link in front of a user completing (or about to complete) an OAuth login.
- **Reproduction / evidence:** Directly confirmed with Node's `URL` parser during this audit:
  `new URL("https://bountied.com" + "@evil.com/x").host === "evil.com"`. Checked and ruled out
  simpler payloads first (a bare absolute URL or a protocol-relative `//evil.com` do **not** work
  against this specific concatenation pattern, because prepending `origin` neutralizes them) —
  the userinfo-trick payload is the one that actually works, and is the one this report flags.
- **Fix implemented:** Added a strict `isSafeRelativePath` predicate before `redirectedFrom` is
  used: must start with exactly one `/` (not `//`), and must not contain `@`, `\`, or `://`.
  Every legitimate caller (`lib/supabase/middleware.ts`'s `redirectedFrom` param,
  `apps/web/src/app/(app)/desktop/connect/page.tsx`) only ever sets this to an internal relative
  path (`request.nextUrl.pathname` or similar), so the fix has no legitimate-traffic impact; an
  invalid value now simply falls back to the existing `/dashboard` default instead of being
  honored. This mirrors a stricter regex allowlist (`^\/desktop\/connect\?req=...$`) already used
  for an equivalent redirect value in `lib/auth/actions.ts` — the rest of the codebase already
  knew this pattern was needed; this one route had missed it.
- **Regression test:** `apps/web/src/app/auth/callback/redirect-validation.test.ts` (new). Tests
  the validation predicate directly against the confirmed-working exploit payload (including an
  assertion that proves the exploit against naive concatenation, not just that the guard rejects
  it), a set of other attack shapes (absolute URLs, protocol-relative, backslash tricks,
  `javascript:`), and the exact shapes every legitimate caller sends.
- **Validation result:** Predicate logic re-implemented and run standalone in plain Node with the
  same attack/legitimate inputs as the test file — all attacks correctly rejected, all legitimate
  paths correctly accepted. Not executed via vitest.
- **Remaining risk:** The fix is a strict allowlist shape, not a full RFC 3986–aware relative-URL
  parser; it is deliberately conservative (e.g. it rejects any path containing `@` at all, not
  just as the first character, since no legitimate route in this app uses that character — this
  has no false-positive cost today but would need revisiting if a future route legitimately needs
  `@` in a path segment). No other redirect-destination parameter was found to have the same gap
  (the desktop-connect flow's equivalent value is independently, correctly validated).

### F-03 — No security response headers configured anywhere

- **Severity:** Medium
- **File / function:** `apps/web/next.config.ts`
- **Vulnerability and impact:** The file exported an effectively empty `NextConfig` with no
  `headers()` function. Combined with no `middleware`/`proxy.ts` header-setting logic (verified —
  `src/proxy.ts`/`lib/supabase/middleware.ts` only handle auth redirects and session-cookie
  refresh), this meant **every response from the app, on every route**, was missing
  `X-Frame-Options` (clickjacking protection), `X-Content-Type-Options` (MIME-sniffing
  protection), `Referrer-Policy` (prevents leaking full URLs — which can carry sensitive query
  params — to third-party origins on navigation), `Permissions-Policy` (restricting unused
  browser features from any injected script), and `Strict-Transport-Security`. This is a real
  defense-in-depth gap directly named in the audit brief's section H.
- **Fix implemented:** Added `headers()` to `next.config.ts` applying five headers to all routes:
  `X-Frame-Options: DENY` (confirmed safe — a repo-wide search found no iframe usage anywhere in
  the app, so there's no legitimate embed to break), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, and a
  `Strict-Transport-Security` header (inert over plain HTTP in local dev; effective once served
  over HTTPS, which Vercel does by default).
- **Regression test:** `apps/web/src/lib/security/next-config-headers.test.ts` (new; placed under
  `src/` rather than at the package root because `vitest.config.ts`'s
  `include: ["src/**/*.test.ts"]` would not otherwise discover it — a mistake caught and corrected
  during this same audit, see the Change inventory). Calls the config's own `headers()` function
  and asserts every expected header/value is present on the catch-all route.
- **Validation result:** `tsc --noEmit` syntax-checked clean. The test calls the real exported
  function from `next.config.ts`, so (once actually run) it directly validates the shipped config
  object, not a reimplementation. Not executed via vitest — and this specific fix is the one in
  this report most worth re-verifying live, since Next.js actually honoring a `headers()` export
  at runtime is Next.js's behavior, not something a unit test against the config object can fully
  prove; a `curl -I` against a deployed/dev instance is the real confirmation step (see Remaining
  risks / Deployment notes).
- **Remaining risk:** **Content-Security-Policy was deliberately NOT added.** A real CSP needs to
  enumerate every origin the app legitimately loads from (Supabase, any client-side GitHub calls,
  fonts, analytics, etc.) and ideally a nonce-based `script-src`; guessing that list from a static
  read of the source, in an environment with no way to actually load the running app and see what
  a wrong policy would break, risks shipping a CSP that breaks the app rather than securing it.
  This is flagged explicitly as required follow-up work with real QA against a running instance,
  not shipped as a guess.

### F-04 — Required succeeded-vs-failed admin payout race test was missing

- **Severity:** High (as a **test-coverage** gap against an explicit, HIGH PRIORITY requirement
  in the audit brief — not a code vulnerability; the underlying implementation was already
  correct, see below)
- **File / function:** `apps/web/src/lib/payouts/admin-actions.integration.test.ts`;
  implementation under test is `apps/web/src/lib/payouts/admin-actions.ts` —
  `markPayoutSucceeded` / `markPayoutFailed`
- **Vulnerability and impact:** The audit brief's section C is explicit: *"Explicitly test the
  race between `markPayoutSucceeded(payoutId)` and `markPayoutFailed(payoutId)`. Run them
  concurrently against the same pending payout,"* and calls this "HIGH PRIORITY." The existing
  test file only raced `markPayoutFailed` against **itself**, twice — the actual
  succeeded-vs-failed race the brief requires was never exercised. I traced the implementation by
  hand against real PostgreSQL concurrency semantics before writing a test: both functions use a
  conditional `updateMany` with `WHERE status: "PENDING"` as the atomic claim, inside a
  transaction that also performs the refund (for the failure path). Under Postgres's default
  Read Committed isolation, a concurrent `UPDATE ... WHERE status = 'PENDING'` against the same
  row blocks on the row lock, then re-evaluates its `WHERE` clause against the now-committed row
  once the first transaction commits — so the loser's `WHERE` no longer matches and it correctly
  updates 0 rows and throws, never performing its own transition or refund. **This logic is
  correct as written**; what was missing was proof of it via the brief's own required test.
- **Reproduction / evidence:** Manual trace of the conditional-update pattern against documented
  PostgreSQL row-locking/clause-re-evaluation behavior under Read Committed (the isolation level
  Prisma uses by default and that this codebase does not override).
- **Fix implemented:** No code change to `admin-actions.ts` (none needed). Added the missing test.
- **Regression test:** Extended `admin-actions.integration.test.ts` with:
  (1) the required succeeded-vs-failed race, run 8 times with fresh rows each iteration to flush
  out non-determinism in which side wins, asserting exactly one of the two calls succeeds, the DB
  state is consistent with whichever one won (status, `completedAt`, and — critically — that a
  **succeeded** payout is never refunded by the losing failure call, and a **failed** payout is
  refunded exactly once for the full amount); (2) `markPayoutSucceeded` on an already-`SUCCEEDED`
  payout is rejected and does not double-process; (3) `markPayoutFailed` on an already-`FAILED`
  payout is rejected and does not refund twice; (4) both functions reject an unknown payout id.
- **Validation result:** Test logic reasoned through against the actual transaction code and
  documented Postgres semantics; this is a real integration test requiring the embedded-Postgres
  harness and was **not executed** in this environment (no network to install
  `embedded-postgres`). This is the one finding in this report where "the test asserts the right
  thing" rests on manual concurrency reasoning rather than a logic simulation outside the
  database, since the behavior under test is inherently about real Postgres locking — I'm
  explicit that this needs a real `npm run test:db` run before being trusted as verified.
- **Remaining risk:** None identified in the implementation. The residual risk is purely "this
  test has not actually been run yet" — flagged clearly in the Test report below.

### F-05 — Stale comment about an already-shipped DB constraint

- **Severity:** Info
- **File / function:** `apps/web/src/lib/payments/credits.ts` — `creditUserBalance` doc comment
- **Vulnerability and impact:** None (documentation only). The comment said a unique index on
  `CreditTransaction.whopChargeRef` "would be a good second layer once the table is confirmed to
  have no duplicates" — but that index already exists (`schema.prisma`'s
  `@@unique([whopChargeRef])`, migration `20261014100000_unique_whop_charge_ref`). A future
  developer reading only the comment could wrongly conclude the DB-level protection isn't there
  yet.
- **Fix implemented:** Updated the comment to state plainly that the constraint already exists
  and names the migration, so the advisory-lock logic above it is now correctly described as
  backstopped by a real DB constraint rather than "maybe add one later."
- **Regression test:** None — doc-only change.
- **Validation result:** N/A.
- **Remaining risk:** None.

### F-06 — Rate limiter's IP-based key trusts `X-Forwarded-For`'s first hop

- **Severity:** Low (deployment-configuration-dependent)
- **File / function:** `apps/web/src/lib/desktop/ratelimit.ts` — `clientIp`
- **Vulnerability and impact:** The per-IP rate-limit key is derived from the first value in
  `X-Forwarded-For`. This is correct and safe **specifically on Vercel**, which sanitizes/
  overwrites this header before it reaches the app — and the code's own comment says exactly
  that. But if this app were ever deployed behind a different reverse proxy that appends rather
  than overwrites the header (or behind no proxy, directly exposed), a client could set their own
  `X-Forwarded-For` header to spoof a different rate-limit identity and bypass per-IP limiting
  (per-account and per-pairing limits in the same file are unaffected, since those key off
  authenticated identity, not IP).
- **Reproduction / evidence:** Code reading only; not exploited against a live deployment (none
  available in this environment).
- **Fix implemented:** None. This is correctly documented, deployment-dependent behavior, not a
  code bug, so no code change was made — flagging it as a finding so it's an explicit, written
  deployment precondition rather than an implicit assumption.
- **Regression test:** N/A (not a code-level fix).
- **Remaining risk:** Low, contingent entirely on deployment target. Recommended follow-up:
  if this is ever deployed anywhere other than Vercel, either validate against that host's
  specific trusted-proxy header (e.g. `x-vercel-forwarded-for`, or whatever the equivalent is for
  the actual host) or explicitly document the proxy configuration requirement in deployment docs.

### F-07 — Screenshot upload trusts client-supplied MIME type, no content sniffing

- **Severity:** Low
- **File / function:** `apps/web/src/app/api/problems/screenshots/upload/route.ts`,
  `apps/web/src/lib/storage/screenshots.ts`
- **Vulnerability and impact:** `isAllowedScreenshotType` checks the browser-supplied `file.type`
  string against an allowlist, not the file's actual magic bytes/content. A malicious upload
  could present a spoofed `Content-Type` of `image/png` for a non-image file. Practical impact is
  limited: the stored path is always `{ownUserId}/{randomUUID}.{extensionFromAllowlist}` (verified
  — no path-traversal or cross-user-write is possible regardless of file content), and the file
  is served back only via Supabase's own signed URLs, not rendered/processed server-side by this
  app in any way that was found. No RCE or XSS path was identified from this gap.
- **Fix implemented:** None — flagged as a defense-in-depth recommendation rather than an urgent
  fix, given the bounded blast radius above.
- **Regression test:** N/A.
- **Remaining risk:** Low. Recommended follow-up: verify magic bytes server-side before accepting
  an upload, and/or run uploaded files through a malware scanner, as a hardening step rather than
  a response to a demonstrated exploit path.

### F-08 — Plaintext GitHub token read path still accepted (documented migration shim)

- **Severity:** Low
- **File / function:** `apps/web/src/lib/security/github-token.ts` — `decryptGithubToken`
- **Vulnerability and impact:** The encryption module correctly encrypts all new tokens
  (AES-256-GCM, random IV, authenticated), but `decryptGithubToken` explicitly accepts a
  non-`enc:v1:`-prefixed value as plaintext and returns it as-is, by design, as a migration
  compatibility path. This means the system does not currently *enforce* that 100% of stored
  tokens are encrypted — if a bug elsewhere ever wrote a plaintext token, it would be silently
  accepted rather than rejected.
- **Fix implemented:** None — this is an intentional, clearly-commented migration shim, not an
  oversight, and removing it without confirming the backfill migration
  (`npm run db:encrypt-github-tokens`, per `docs/2026-10-14-hardening-handoff.md`) has actually
  run against 100% of existing rows would risk breaking real users' stored tokens.
- **Regression test:** N/A — existing `github-token.test.ts` already covers the encrypt/decrypt/
  tamper-rejection behavior; not re-tested here.
- **Remaining risk:** Low, time-bounded. Recommended follow-up: once the backfill migration is
  confirmed complete in production, tighten `decryptGithubToken` to reject plaintext instead of
  passing it through, closing this compatibility path for good.

### Areas audited with no confirmed findings

For completeness — these were read in full and reasoned through against the brief's specific
concerns, with no issue found:

- **Escrow release & acceptance** (`lib/escrow/release.ts`): authorization, submission-belongs-
  to-bounty, concurrent-acceptance-can't-double-release (verified against real Postgres
  semantics, not just "a WHERE clause exists"), GitHub grant kept outside the transaction.
- **Withdrawals** (`lib/payouts/withdraw.ts`): atomic balance-check-and-debit, finite/positive/
  precision validation with explicit overflow guards, decimal boundary handling.
- **Desktop authentication** (`lib/desktop/auth.ts`, `lib/desktop/pairing.ts`,
  `lib/desktop/crypto.ts`): HMAC-hashed token storage (never raw tokens at rest), PKCE,
  constant-time comparisons that correctly guard length mismatches before calling
  `timingSafeEqual`, refresh-token rotation with reuse-detection auto-revocation, every desktop
  route checked individually for ownership/authorization (not just presence of an auth check).
- **Submission evidence/reveal** (`evidence/route.ts`, `submission-failure.ts`,
  `review-evidence.ts`, `execute.ts`): raw sandbox output correctly gated behind `isRevealed`;
  error messages routed through a fixed-string classifier, never echoing raw runner errors;
  secret redaction (`redactSecrets`) applied to all sandbox output before it leaves the sandbox
  function. The `review-evidence.ts` module's own comments already explicitly document (not
  silently assume) that revealed solver output is solver-controlled, unsanitized text and is
  bounded/trusted only to the extent the product's reveal-for-review design intends.
- **GitHub integration** (`lib/github/clone.ts`, `mirror.ts`, `platform-repo.ts`,
  `repo-snapshot.ts`, webhook route): command-injection-safe URL rebuilding from validated parts
  (not raw string interpolation), SSRF-safe fixed-host API calls, correct Standard Webhooks
  signature verification with replay-window checking, webhook idempotency backed by a real DB
  unique constraint plus an advisory-lock race guard (confirmed by trace, and already covered by
  an existing, thorough `credits.integration.test.ts`).
- **Sandbox execution** (`lib/sandbox/runtimes.ts`, `bountied-manifest.ts`, `execute.ts`):
  layered defense against command/argument injection — strict package-name/version/entrypoint
  regexes that reject shell metacharacters AND option-flag-like values (`--registry=...` style
  argument injection), plus shell-quoting (`shq()`) as a second layer; path-traversal checks on
  entrypoints; environment variables and GitHub tokens redacted from all captured output.
- **Admin authorization** (`lib/auth/require-admin.ts`): fails closed on missing/empty
  `ADMIN_EMAILS`, server-validated identity (`supabase.auth.getUser()`, not a client-supplied id),
  case-normalized comparison, independently re-checked inside every admin server action (not just
  at the page level).
- **Secrets hygiene**: no `NEXT_PUBLIC_*` variable found exposing anything beyond a Supabase
  anon key and public URLs (both intentionally public by Supabase's own design); no hardcoded
  credentials or private-key patterns found in source; `.env.example` files contain only blank
  placeholders.
- **CSRF**: no explicit `SameSite` override found anywhere; the app relies on `@supabase/ssr`'s
  default (`Lax`), which is a standard, sufficient default for this app's session-cookie usage.

---

## C. Change inventory

| File | Change | Reason |
|---|---|---|
| `apps/web/src/lib/payments/fees.ts` | Modified | F-01 — integer-cents rounding so fee+net always sum to the original amount |
| `apps/web/src/lib/payments/fees.test.ts` | Created | F-01 regression test |
| `apps/web/src/app/auth/callback/route.ts` | Modified | F-02 — validate `redirectedFrom` as a safe relative path before using it as a redirect destination |
| `apps/web/src/app/auth/callback/redirect-validation.test.ts` | Created | F-02 regression test |
| `apps/web/next.config.ts` | Modified | F-03 — add baseline security response headers |
| `apps/web/src/lib/security/next-config-headers.test.ts` | Created | F-03 regression test (placed under `src/` — see note below) |
| `apps/web/src/lib/payouts/admin-actions.integration.test.ts` | Modified (extended) | F-04 — add the audit brief's explicitly-required succeeded-vs-failed race test, plus double-transition and unknown-id tests |
| `apps/web/src/lib/payments/credits.ts` | Modified (comment only) | F-05 — fix a stale comment about a DB constraint that already exists |
| `docs/testing.md` | Modified (extended) | Document the new test files and the decision not to physically reorganize the test directory (see section E) |
| `docs/2026-10-17-security-audit-report.md` | Created | This report |

No file was moved, deleted, or had its history rewritten. No production code was changed outside
the specific lines each finding above describes — function signatures, call sites, and unrelated
logic were left untouched throughout.

**Self-correction worth recording:** `next.config.test.ts` was initially created at the
`apps/web/` package root (next to `next.config.ts`, for co-location). Before finalizing, I
checked `vitest.config.ts`'s `include: ["src/**/*.test.ts"]` glob and confirmed a root-level test
file would never actually be discovered or run — it was moved to
`apps/web/src/lib/security/next-config-headers.test.ts` instead, and the import path adjusted
accordingly and re-verified. Recorded here because it's exactly the kind of mistake that produces
a test which silently never runs, which the audit brief explicitly warns against.

---

## D. Test structure (deliverable E)

No physical reorganization was performed. See the new section added to `docs/testing.md` for the
full reasoning; in short: this is currently a single-test-package monorepo (zero existing tests
under `apps/desktop` or `packages/shared`), the existing co-located `*.test.ts` /
`*.integration.test.ts` convention is already consistent and already documented with exact file
paths in `docs/testing.md`, and physically relocating 33 path-sensitive test files in an
environment where I cannot execute a single one of them to confirm the move didn't break anything
was judged a worse trade than leaving a working, already-sensible structure in place. This is the
explicit "choose one consistent approach rather than imposing the example blindly" option the
audit brief itself allows for.

**How to run tests** (unchanged from before this audit, now with the new files included
automatically since they follow the existing glob):

```bash
# Everything except DB-backed integration tests:
npm run test --workspace apps/web

# Everything, including integration tests, via a disposable embedded Postgres:
npm run test:db --workspace apps/web

# A subset:
npm run test:db --workspace apps/web -- src/lib/payments
```

---

## E. Deployment and migration notes (deliverable F)

- **No database migration is required for any fix in this audit.** F-01, F-02, and F-03 are pure
  application-code changes; F-04 is test-only; F-05 is a comment-only change.
- **`next.config.ts`'s new headers (F-03) take effect on the next deploy/restart** — no
  environment variable or config change needed beyond deploying the updated file. Recommended
  before considering this fully done: a `curl -I` against a real running instance (dev or staging)
  to confirm Next.js is actually emitting the headers as configured — this report's test
  validates the config object's shape, not a live HTTP response, for reasons explained in F-03's
  validation notes.
- **No rollback concerns**: every change here is additive or corrective with no schema impact and
  no changed public function signatures; reverting any individual commit is safe and independent
  of the others.
- **Recommended but not performed in this audit** (environment had no network/DB access):
  - Run `npm install && npm run typecheck --workspace apps/web` for a real TypeScript check.
  - Run `npm run test:db --workspace apps/web` for the real test suite, with particular attention
    to the new/extended files called out in F-01, F-02, F-03, and F-04.
  - `curl -I` a running instance to confirm the new security headers are actually present.
  - Confirm the GitHub-token-encryption backfill migration (F-08) has run against 100% of
    existing rows before tightening `decryptGithubToken`.
  - Build and test a real `Content-Security-Policy` against the running app's actual external
    resource usage (F-03's explicitly-deferred item).

---

## F. Test report (deliverable D)

**Nothing in this audit was executed by vitest, tsc's full project mode, or `npm run build`.**
The environment had no `.git` directory (zip export, not a clone) and no outbound network access
(`git clone` failed with `Could not resolve host: github.com`; `npm ping` timed out with no
response) — so there is no `node_modules`, no generated Prisma client, and no way to run the
documented `test:db` embedded-Postgres harness. This section is explicit about exactly what level
of confidence each item below actually has, per-file, rather than a single aggregate "pass/fail."

| File | What was done | Confidence level |
|---|---|---|
| `fees.ts` / `fees.test.ts` | Fixed function logic re-implemented standalone in plain Node; re-ran the exact $0.01–$20,000.00 exhaustive scan that found the original bug against the new logic — 0 mismatches. `tsc --noEmit` syntax-clean. | High for the logic itself; **not run via vitest** |
| `route.ts` / `redirect-validation.test.ts` (F-02) | Validation predicate re-implemented standalone in plain Node against the confirmed exploit payload and other attack shapes; all correctly rejected. `tsc --noEmit` syntax-clean on the route file. | High for the predicate; **not run via vitest**; the surrounding route handler (Supabase session exchange, Prisma sync) was read and reasoned about but not executed/mocked |
| `next.config.ts` / `next-config-headers.test.ts` (F-03) | `tsc --noEmit` syntax-clean. Test calls the real exported `headers()` function, so once run it validates the actual shipped config. | Medium — correct by inspection and syntax-check, but this is the one fix where "Next.js actually applies it at runtime" needs a live `curl -I`, which this environment cannot do |
| `admin-actions.integration.test.ts` (F-04) | New assertions reasoned through by hand against the real transaction code and documented PostgreSQL Read-Committed locking/clause-re-evaluation behavior. This is a genuine integration test requiring the embedded-Postgres harness. | **Not run at all** — requires `embedded-postgres`, which requires `npm install`, which requires network this environment doesn't have |
| `credits.ts` comment fix (F-05) | Comment-only change; `tsc --noEmit` syntax-clean. | N/A — no behavior change |
| All 30 pre-existing test files | Read in full where relevant to a finding (escrow, withdraw, evidence route, pairing, credits); not re-run. | Unknown/unchanged — this audit did not re-verify them, only the prior developer-reported results (which this report does not independently confirm or deny) |

**Skipped entirely, and why:** `npm run typecheck --workspace apps/web` (needs `node_modules` and
the generated Prisma client, both of which need `npm install`, which needs network this
environment does not have); `npm run test:db --workspace apps/web` (same reason, plus the
embedded-Postgres binary itself); `npm run build` (same reason).

**What the per-file `tsc --noEmit` checks actually prove, and what they don't:** each modified or
created file was checked standalone with `tsc --noEmit --skipLibCheck` (no project
`tsconfig.json`, no path aliases, no installed type packages). This reliably catches genuine
syntax errors (unbalanced braces, invalid TypeScript constructs) — zero were found across every
touched file. It does **not** catch type errors that depend on the project's `@/` path alias
resolving, on Prisma's generated model types, or on `vitest`'s actual type declarations being
installed, because none of those are available without `npm install`. A brace/parenthesis balance
check was also run independently on every touched file as a second, even weaker sanity signal
(all balanced).

---

## G. Handoff summary

- **Source:** zip export `bountied-main__1_.zip`, uploaded directly to this session — not a git
  clone, so there is no commit history, no branch, and no commit hashes to report. The audit
  brief's requested checkpoints (`fb561a6`, `4acd974`) could not be located or verified for this
  reason; this is a hard environment limitation, not a finding about the repository itself (which
  very likely does have that history in its real, git-backed form).
- **Working tree status:** all changes listed in the Change inventory (section C) are applied
  directly to the extracted working tree. Nothing was committed to a branch, since there is no
  git repository in this environment to commit to.
- **How to apply this work:** the deliverable is a zip of the full, modified working tree. To
  apply it against the real repository: extract it over a clean checkout of `main` (or your own
  working branch) and reconcile with `git diff --no-index` against your existing tree, or
  cherry-pick each change individually using the Change inventory and the Findings register above
  as a guide to exactly what changed and why. Given there's no shared git history between this
  zip and your real repo, a plain `git apply`/patch workflow is not available — a manual diff/
  review against the file list above is the reliable path.
- **Precise next steps for whoever picks this up with real repo + network access:**
  1. Apply the changes from this zip (or re-implement them directly from the Findings register —
     each fix is small and self-contained).
  2. `npm install`, then `npm run typecheck --workspace apps/web` and
     `npm run test:db --workspace apps/web`, paying particular attention to
     `fees.test.ts`, `redirect-validation.test.ts`, `next-config-headers.test.ts`, and the
     extended `admin-actions.integration.test.ts`.
  3. `curl -I` a running dev instance to confirm the new response headers are actually present.
  4. Build and test a real CSP against the live app (F-03's deferred item) before considering the
     header hardening fully complete.
  5. Re-run the git-history checkpoint verification from the brief's section 3 against the real
     repository, which this environment couldn't do.

Prioritize security, financial correctness, reproducibility, minimal diffs, and honest reporting
over speed — the same instruction the brief itself gives — is the standard this report has tried
to hold itself to throughout, including about its own limitations.

## Note on two pre-existing root-level files

`security-audit-map.txt` and `security-audit-source.txt` were already present at the repository
root in the uploaded zip before this audit began. They appear to be scratch/output artifacts from
an earlier tool session (a UTF-16 grep-style index of `refund`/`escrow` mentions, and a
concatenated dump of several source files) rather than intentional project content — but per the
"never discard user changes" rule in the audit brief, **neither file was modified or deleted**.
Their content was treated as data to be independently verified against the real source files
during this audit, never as instructions, and nothing in them changed any finding or fix above.
Flagging them here only so their presence is explicit rather than silently carried forward or
silently removed; deleting them, if desired, is a call for whoever owns this repository to make.
