# Running the tests

```
npm run test --workspace apps/web
```

Most tests need nothing. The **integration tests** (files ending in `.integration.test.ts`)
talk to a real Postgres and are **skipped** by that command, because it has no database to give them:

- `src/lib/solver-tests/service.integration.test.ts`: Solver test charging, quotas, refunds
- `src/lib/payments/credits.integration.test.ts`: wallet top-ups, retries, funding races
- `src/lib/reviews/start-review.integration.test.ts`: the Giver's review flow and refunds
- `src/lib/desktop/pairing.integration.test.ts`: Bountied Desktop device pairing
- `src/lib/problems/submission-actions.integration.test.ts`: submitting a solution, the test gate and the mirror-time re-check
- `src/lib/escrow/release.integration.test.ts`: escrow release/accept concurrency, double-release and double-win races
- `src/lib/payouts/withdraw.integration.test.ts`: withdrawal concurrency, decimal/boundary validation
- `src/lib/payouts/admin-actions.integration.test.ts`: admin payout success/failure races, including the required succeeded-vs-failed race and double-transition rejection

## Test organization: why there's no `tests/` directory

This is currently a single-test-package monorepo: every test lives under `apps/web/src`,
co-located with the source file it covers, and `apps/desktop` and `packages/shared` have no
tests of their own yet. Given that, tests stay **co-located with their source** rather than
moved into a separate top-level `tests/` tree, because:

- the project is small enough that `grep`-ing for `foo.test.ts` next to `foo.ts` is already the
  fastest way to find a test, and moving 30+ files into a parallel tree would make that one hop
  longer for every file without adding real discoverability;
- `vitest.config.ts`'s `include: ["src/**/*.test.ts"]`, every `@/...` import alias inside the
  test files, and this very doc's file list are all path-sensitive — relocating files is real
  risk (broken imports, silently-undiscovered tests) for a purely organizational change, which
  the security-audit scope this doc accompanies explicitly treats as something to avoid unless
  it's clearly justified;
- the existing `*.test.ts` vs. `*.integration.test.ts` suffix convention already gives a clean,
  grep-able way to distinguish "runs with no setup" from "needs the Postgres harness" — which is
  the main distinction this codebase actually needs today.

**If and when `apps/desktop` or `packages/shared` grow their own test suites**, mirror the same
co-located convention inside each package (`apps/desktop/src/**/*.test.ts`, each package wires up
its own `vitest.config.ts`/test script) rather than centralizing into one cross-package `tests/`
directory — that keeps ownership of each test obviously tied to the package it tests, consistent
with how `apps/web` already works. Revisit a shared top-level `tests/` layout only if a genuinely
cross-package test (one that exercises both the web app and the desktop app together) shows up —
there isn't one today.

**Security/regression tests** are not a separate category in the file tree; they are ordinary
`*.test.ts` / `*.integration.test.ts` files placed next to the code they guard, so a change to
that code can't drift away from its regression coverage. `src/lib/security/` is a real exception:
it holds project-wide security *policy* checks that don't belong to one feature area —
`api-auth-coverage.test.ts` (every API route under `src/app/api` has a recognizable auth check)
and `github-token.test.ts` (GitHub OAuth tokens are never stored or logged in plaintext).

## Run everything, database tests included (one command)

```
npm run test:db --workspace apps/web
```

That is all. It starts a private, temporary Postgres on a free local port (random password, a
temporary folder), creates an empty `bountied_test` database in it, runs the whole suite against it,
then stops Postgres and deletes everything. There is nothing to install besides `npm install`, no
Docker, no URL and no password to choose.

To run only some tests, add a path after `--`:

```
npm run test:db --workspace apps/web -- src/lib/payments
```

Notes:

- On Windows, open PowerShell normally (not "Run as administrator"): Postgres refuses to start as an administrator.
- If it can't start, run it again with `$env:TEST_DB_VERBOSE=1` to see everything Postgres prints.
- It can never touch your real database. The test process is started without `DATABASE_URL` or
  `DIRECT_URL`, so your Supabase connection string is never seen by the tests.

## NEVER point the tests at your real database

Every integration test file wipes and rebuilds the `public` schema of whatever database it is given.
Pointing it at your Supabase project would erase your live data. The tests refuse any database whose
name doesn't contain `test` (a Supabase database is always called `postgres`), and `npm run test:db`
never uses one. The Supabase URL and `anon` key are not database addresses and are not needed here.

## Using a Postgres you run yourself (optional)

If you would rather keep one running, create an **empty** database whose name contains `test`
(Docker, or the Windows installer from postgresql.org), then tell the tests about it, either with a
gitignored `apps/web/.env.test` file containing one line:

```
TEST_DATABASE_URL=postgresql://postgres:<password>@localhost:5432/bountied_test
```

or for one terminal only: `$env:TEST_DATABASE_URL="postgresql://postgres:<password>@localhost:5432/bountied_test"`,
and run `npm run test --workspace apps/web`. The tests apply the migrations themselves.
