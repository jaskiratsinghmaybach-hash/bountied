# Running the tests

```
npm run test --workspace apps/web
```

Most tests need nothing. The **integration tests** (files ending in `.integration.test.ts`)
talk to a real Postgres and are **skipped** unless you give them a database:

- `src/lib/solver-tests/service.integration.test.ts`: Solver test charging, quotas, refunds
- `src/lib/payments/credits.integration.test.ts`: wallet top-ups, retries, funding races
- `src/lib/reviews/start-review.integration.test.ts`: the Giver's review flow and refunds
- `src/lib/desktop/pairing.integration.test.ts`: Bountied Desktop device pairing
- `src/lib/problems/submission-actions.integration.test.ts`: submitting a solution, the test gate and the mirror-time re-check

## The test database

It is a **throwaway** database. Every integration test file wipes and rebuilds its `public`
schema from the migrations, so:

- it must be a **separate, empty** database, never your real one;
- its name must contain `test` (the tests refuse to run otherwise). A Supabase project can't be
  used: its database is always called `postgres`;
- you do not need to run any migrations yourself. The tests apply them.

### Easiest: Docker

```
docker run -d --name bountied-test-db -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=bountied_test -p 5433:5432 postgres:16
```

The URL is `postgresql://postgres:pw@localhost:5433/bountied_test`. Next time, `docker start bountied-test-db`.
(Port 5433 so it can't clash with a Postgres you already run on 5432.)

### Without Docker

Install PostgreSQL 16 for Windows from postgresql.org, then create an empty database, for example in
PowerShell: `& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres bountied_test`.
The URL is `postgresql://postgres:<your-password>@localhost:5432/bountied_test`. If the password has
special characters, URL-encode them (`@` becomes `%40`).

### Tell the tests about it (pick one)

1. **Once, in a file (recommended):** create `apps/web/.env.test` containing the single line
   `TEST_DATABASE_URL=postgresql://postgres:pw@localhost:5433/bountied_test`.
   It is gitignored, and only `TEST_*` keys are ever read from it.
2. **Per terminal:** `$env:TEST_DATABASE_URL="postgresql://postgres:pw@localhost:5433/bountied_test"`
   (PowerShell; it lasts until you close the window).

Then run `npm run test --workspace apps/web`. The integration test files stop showing as skipped.
