# 2026-10-14 hardening handoff

This source update contains three code-level items from the security/payment backlog:

1. AES-256-GCM encryption for stored GitHub OAuth tokens (`enc:v1:`), with legacy plaintext reads during migration, encrypted writes, and a dry-run-first migration script. All production token reads identified in the source are routed through decryption before using the token as a bearer credential.
2. Whop wallet crediting now checks the provider payment's explicit `total.amount` or `final_amount` against `metadata.requiredAmount`, and requires USD currency. Missing amount/currency and mismatches fail closed. The supported shapes align with Whop's published integration examples, but must still be confirmed against an actual event from this Whop account before live use.
3. `CreditTransaction.whopChargeRef` now has a unique nullable index. The migration checks for duplicate non-null references and stops with an actionable error instead of silently discarding data.

## Before deploying

- Set a securely generated `GITHUB_TOKEN_ENCRYPTION_KEY` (base64 encoding of exactly 32 random bytes) in every server environment. Preserve it securely; losing it makes encrypted tokens unreadable.
- Back up the database and run `npm run db:encrypt-github-tokens` from `apps/web` as a dry run. Confirm it points to the intended database, then use `npm run db:encrypt-github-tokens -- --apply`.
- Before applying migrations, check for duplicate non-null `CreditTransaction.whopChargeRef` values. The migration itself also checks and aborts if any exist.
- Obtain a real signed Whop `payment.succeeded` payload, confirm amount/currency field names and units, and test a valid payment plus amount/currency mismatches in a controlled environment.

## Verification status

The token encryption/decryption/tamper smoke test passed using Node's built-in crypto. The migration script passes `node --check`, and TypeScript syntax transpilation passed for the changed TS files. Full Vitest, ESLint and project typecheck could not be run in this environment because `npm ci` failed with an npm transport/exit-handler error while fetching dependencies. No live Supabase, Whop, E2B, or GitHub mirror operation was run.
