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
